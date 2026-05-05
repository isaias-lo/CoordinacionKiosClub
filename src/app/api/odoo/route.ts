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
    };
    const { action, config, query = '' } = body;
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
          fields: ['name', 'partner_id', 'state', 'scheduled_date'],
          limit: 15,
          order: 'name desc',
        }],
      })) as Array<{
        id: number;
        name: string;
        partner_id: [number, string] | false;
        state: string;
        scheduled_date: string | false;
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
        })),
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al conectar con Odoo';
    console.error('[/api/odoo]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
