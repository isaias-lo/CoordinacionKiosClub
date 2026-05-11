import { NextRequest, NextResponse } from 'next/server';

interface OdooRpcParams {
  service: string;
  method: string;
  args: unknown[];
}

async function odooRpc(baseUrl: string, params: OdooRpcParams): Promise<unknown> {
  const url = baseUrl.replace(/\/$/, '') + '/jsonrpc';

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params }),
      signal: AbortSignal.timeout(15_000), // 15 s timeout
    });
  } catch (netErr) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    if (msg.includes('abort') || msg.includes('timeout')) {
      throw new Error(`Tiempo de espera agotado. Verifica que ${baseUrl} sea accesible.`);
    }
    throw new Error(`No se pudo conectar con Odoo (${url}): ${msg}`);
  }

  // Read as text first — Odoo sometimes returns an HTML error page
  const text = await res.text();
  let data: { result?: unknown; error?: { data?: { message?: string }; message?: string } };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    const preview = text.slice(0, 120).replace(/\n/g, ' ');
    throw new Error(
      `Odoo respondió con HTTP ${res.status} y contenido no-JSON. ` +
      `Verifica que la URL sea correcta y que el servidor esté activo. ` +
      `Respuesta: "${preview}"`
    );
  }

  if (data.error) {
    const detail = data.error.data?.message || data.error.message || 'Odoo RPC error';
    throw new Error(detail);
  }

  return data.result;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: string;
      config: { url: string; db: string; username: string; apiKey: string };
      query?: string;
      pickings?: string[];
    };
    const { action, config, query = '', pickings = [] } = body;
    let { url } = config;
    const { db, username, apiKey } = config;

    // Auto-prepend https:// if the user forgot the protocol
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    /* ── list_databases: no credentials needed ── */
    if (action === 'list_databases') {
      if (!url) return NextResponse.json({ error: 'Ingresa la URL del servidor primero.' }, { status: 400 });
      const dbs = (await odooRpc(url, { service: 'db', method: 'list', args: [] })) as string[];
      return NextResponse.json({ databases: dbs });
    }

    if (!url || !db || !username || !apiKey) {
      return NextResponse.json({ error: 'Configuración Odoo incompleta. Rellena URL, base de datos, usuario y contraseña/API key.' }, { status: 400 });
    }

    // Authenticate — returns uid (number) or false if wrong credentials
    const uid = (await odooRpc(url, {
      service: 'common',
      method: 'authenticate',
      args: [db, username, apiKey, {}],
    })) as number | false | null;

    if (!uid) {
      return NextResponse.json({
        error: `Credenciales incorrectas para la base de datos "${db}". Verifica usuario y contraseña/API key.`,
      }, { status: 401 });
    }

    /* ── test_connection: just verify auth works ── */
    if (action === 'test_connection') {
      return NextResponse.json({ ok: true, uid, message: `Conectado como UID ${uid}` });
    }

    /* ── search_operations ── */
    if (action === 'search_operations') {
      const domain: unknown[] = query ? [['name', 'ilike', query]] : [];

      const ops = (await odooRpc(url, {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read', [domain], {
          fields: ['name', 'partner_id', 'state', 'scheduled_date', 'user_id'],
          limit: 15,
          order: 'name desc',
        }],
      })) as Array<{
        id: number;
        name: string;
        partner_id: [number, string] | false;
        state: string;
        scheduled_date: string | false;
        user_id: [number, string] | false;
      }>;

      const STATE_LABELS: Record<string, string> = {
        draft: 'Borrador', waiting: 'Esperando', confirmed: 'Confirmado',
        assigned: 'Listo', done: 'Hecho', cancel: 'Cancelado',
      };

      return NextResponse.json({
        operations: ops.map(op => ({
          id: op.id,
          name: op.name,
          partner: Array.isArray(op.partner_id) ? op.partner_id[1] : 'Sin destinatario',
          state: STATE_LABELS[op.state] ?? op.state,
          fecha: op.scheduled_date
            ? new Date(op.scheduled_date).toLocaleDateString('es-CL')
            : '',
          responsable: Array.isArray(op.user_id) ? op.user_id[1] : undefined,
        })),
      });
    }

    /* ── search_product ── */
    if (action === 'search_product') {
      const codigo = (query || '').replace(/[\[\]]/g, '').trim().toUpperCase();
      if (!codigo) return NextResponse.json({ error: 'Ingresa un código de producto' }, { status: 400 });

      const products = (await odooRpc(url, {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, apiKey, 'product.product', 'search_read',
          [[['default_code', '=', codigo]]],
          { fields: ['id', 'default_code', 'name'], limit: 1 },
        ],
      })) as Array<{ id: number; default_code: string | false; name: string }>;

      if (!products.length) return NextResponse.json({ productos: [] });

      const productId = products[0].id;
      let cantidadEsperada: number | undefined;

      const validPickings = (pickings as string[]).filter(p => p.trim());
      if (validPickings.length > 0) {
        try {
          const moves = (await odooRpc(url, {
            service: 'object',
            method: 'execute_kw',
            args: [db, uid, apiKey, 'stock.move', 'search_read',
              [[['picking_id.name', 'in', validPickings], ['product_id', '=', productId], ['state', '!=', 'cancel']]],
              { fields: ['product_uom_qty'], limit: 20 },
            ],
          })) as Array<{ product_uom_qty: number }>;
          if (moves.length > 0) {
            cantidadEsperada = moves.reduce((sum, m) => sum + (m.product_uom_qty || 0), 0);
          }
        } catch { /* no critico — cantidad queda undefined */ }
      }

      return NextResponse.json({
        productos: [{
          id: products[0].id,
          codigo: typeof products[0].default_code === 'string' ? products[0].default_code : codigo,
          nombre: products[0].name,
          cantidadEsperada,
        }],
      });
    }

    /* ── get_picker_stats ── */
    if (action === 'get_picker_stats') {
      const pickerName = query;
      if (!pickerName) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 });

      const users = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'res.users', 'search_read',
          [[['name', '=', pickerName]]],
          { fields: ['id', 'name'], limit: 1 },
        ],
      })) as Array<{ id: number; name: string }>;

      if (!users.length) return NextResponse.json({ stats: null, message: 'Usuario no encontrado en Odoo' });
      const pickerUserId = users[0].id;

      const since = new Date(); since.setDate(since.getDate() - 90);
      const sinceStr = since.toISOString().slice(0, 10) + ' 00:00:00';

      const [pickingGroups, doneThisWeek, discrepancias] = await Promise.all([
        odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking', 'read_group',
            [[['user_id', '=', pickerUserId], ['create_date', '>=', sinceStr]]],
            ['state'], ['state'],
          ],
        }) as Promise<Array<{ state: string; state_count: number }>>,

        odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking', 'search_count',
            [[['user_id', '=', pickerUserId], ['state', '=', 'done'],
              ['date_done', '>=', new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10) + ' 00:00:00']]],
          ],
        }) as Promise<number>,

        odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.move.line', 'search_count',
            [[['picking_id.user_id', '=', pickerUserId], ['state', '=', 'done'],
              ['qty_done', '!=', ['product_uom_qty']]]],
          ],
        }).catch(() => 0) as Promise<number>,
      ]);

      const stateMap: Record<string, number> = {};
      for (const g of pickingGroups as Array<{ state: string; state_count: number }>) stateMap[g.state] = g.state_count;

      return NextResponse.json({
        stats: {
          userId: pickerUserId,
          userName: users[0].name,
          totalDone: stateMap['done'] ?? 0,
          totalAssigned: stateMap['assigned'] ?? 0,
          totalConfirmed: stateMap['confirmed'] ?? 0,
          totalWaiting: stateMap['waiting'] ?? 0,
          doneThisWeek: typeof doneThisWeek === 'number' ? doneThisWeek : 0,
          discrepancias: typeof discrepancias === 'number' ? discrepancias : 0,
        },
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al conectar con Odoo';
    console.error('[/api/odoo]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
