import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit';

// Credentials are read from server-side env vars only — never from the request body.
// Prefer ODOO_* (no NEXT_PUBLIC_) so the API key is not compiled into the browser bundle.
const SRV_URL      = process.env.ODOO_URL      ?? process.env.NEXT_PUBLIC_ODOO_URL      ?? '';
const SRV_DB       = process.env.ODOO_DB       ?? process.env.NEXT_PUBLIC_ODOO_DB       ?? '';
const SRV_USERNAME = process.env.ODOO_USERNAME ?? process.env.NEXT_PUBLIC_ODOO_USERNAME ?? '';
const SRV_API_KEY  = process.env.ODOO_API_KEY  ?? process.env.NEXT_PUBLIC_ODOO_API_KEY  ?? '';

/** Formatea una Date como 'YYYY-MM-DD' usando la hora LOCAL (no UTC). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  if (!checkRateLimit(`odoo:${getClientIp(req)}`, { max: 30, windowMs: 60_000 }))
    return tooManyRequests();

  try {
    const body = (await req.json()) as {
      action: string;
      query?: string;
      pickings?: string[];
      dateFrom?: string;
      dateTo?: string;
      incluyePendientes?: boolean;
      // config.url accepted only for list_databases; all auth credentials ignored from client
      config?: { url?: string };
    };
    const { action, query = '', pickings = [] } = body;
    const dateFrom = body.dateFrom ?? '2026-05-01';
    const dateTo   = body.dateTo   ?? '2026-05-31';

    // Use server-side credentials exclusively
    let url      = SRV_URL;
    const db       = SRV_DB;
    const username = SRV_USERNAME;
    const apiKey   = SRV_API_KEY;

    // Auto-prepend https:// if needed
    if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    /* ── list_databases: allow URL override, no auth needed ── */
    if (action === 'list_databases') {
      let targetUrl = (body.config?.url ?? url);
      if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      if (!targetUrl) return NextResponse.json({ error: 'Ingresa la URL del servidor primero.' }, { status: 400 });
      const dbs = (await odooRpc(targetUrl, { service: 'db', method: 'list', args: [] })) as string[];
      return NextResponse.json({ databases: dbs });
    }

    if (!url || !db || !username || !apiKey) {
      return NextResponse.json({ error: 'Configuración Odoo no disponible en el servidor.' }, { status: 503 });
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
      const sinceStr = localDateStr(since) + ' 00:00:00';

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
              ['date_done', '>=', localDateStr(new Date(Date.now() - 7 * 864e5)) + ' 00:00:00']]],
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

    /* ── picking_today_operations ── */
    if (action === 'picking_today_operations') {
      const storeCod = (query || '').trim().toUpperCase();

      // Build today's date range using local date (not UTC) to avoid missing pickings
      // after ~20:00 in negative-UTC timezones like Chile (UTC-3/-4)
      const now = new Date();
      const todayStr = localDateStr(now);

      // Find picking_type IDs for "Despacho Tiendas" — query first, then filter by ID
      let pickingTypeIds: number[] = [];
      try {
        const ptRows = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking.type', 'search_read',
            [[['name', 'ilike', 'Despacho Tiendas']]],
            { fields: ['id'], limit: 10 },
          ],
        })) as Array<{ id: number }>;
        pickingTypeIds = ptRows.map(r => r.id);
      } catch { /* if this fails, skip the filter and return all */ }

      const domain: unknown[] = [
        ['state', 'not in', ['draft', 'cancel']],
        ['scheduled_date', '>=', todayStr + ' 00:00:00'],
        ['scheduled_date', '<=', todayStr + ' 23:59:59'],
        ['origin', 'not ilike', 'AUDITORIA'],
      ];
      // Filter by picking type if found; fallback to origin containing "Abastecimiento"
      if (pickingTypeIds.length > 0) {
        domain.push(['picking_type_id', 'in', pickingTypeIds]);
      } else {
        domain.push(['origin', 'ilike', 'Abastecimiento']);
      }
      if (storeCod) {
        // La tienda se reconoce por el origin (texto manual, puede tener typos) O por
        // la ubicación destino (location_dest_id = columna "A", dato estructurado y fiable).
        domain.push('|',
          ['origin', 'ilike', storeCod],
          ['location_dest_id.complete_name', 'ilike', storeCod]);
      }

      const pickings = (await odooRpc(url, {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read', [domain], {
          fields: ['name', 'origin', 'partner_id', 'location_id', 'location_dest_id',
                   'state', 'scheduled_date', 'date_done', 'picking_type_id', 'user_id'],
          limit: 500,
          order: 'scheduled_date asc',
        }],
      })) as Array<{
        id: number; name: string; origin: string | false;
        partner_id: [number, string] | false;
        location_id: [number, string]; location_dest_id: [number, string];
        state: string; scheduled_date: string | false; date_done: string | false;
        picking_type_id: [number, string];
        user_id: [number, string] | false;
      }>;

      // Batch-fetch stock.move records — only count moves with actual stock reserved.
      // state 'confirmed' = demanded but nothing reserved (reserved = 0, not pickeable).
      // state 'assigned' | 'partially_available' | 'done' = has reserved qty (pickeable).
      // This query is best-effort: if it fails the pickings still load with lineCount = 0.
      const pickingIds = pickings.map(p => p.id);
      let linesByPicking: Record<number, number> = {};
      try {
        if (pickingIds.length) {
          const moves = (await odooRpc(url, {
            service: 'object',
            method: 'execute_kw',
            args: [db, uid, apiKey, 'stock.move', 'search_read',
              [[['picking_id', 'in', pickingIds],
                ['state', 'in', ['assigned', 'partially_available', 'done']]]],
              { fields: ['picking_id'], limit: 5000 },
            ],
          })) as Array<{ picking_id: [number, string] | false }>;
          for (const mv of moves) {
            if (!Array.isArray(mv.picking_id)) continue;
            const pid = mv.picking_id[0];
            linesByPicking[pid] = (linesByPicking[pid] ?? 0) + 1;
          }
        }
      } catch { /* lineCount stays 0 for all pickings — non-critical */ }

      return NextResponse.json({
        pickings: pickings.map(p => ({
          id: p.id,
          name: p.name,
          origin: typeof p.origin === 'string' ? p.origin : '',
          partner: Array.isArray(p.partner_id) ? p.partner_id[1] : '',
          fromLocation: Array.isArray(p.location_id) ? p.location_id[1] : '',
          toLocation: Array.isArray(p.location_dest_id) ? p.location_dest_id[1] : '',
          state: p.state,
          scheduledDate: typeof p.scheduled_date === 'string' ? p.scheduled_date : '',
          dateDone: typeof p.date_done === 'string' ? p.date_done : null,
          pickingType: Array.isArray(p.picking_type_id) ? p.picking_type_id[1] : '',
          responsible: Array.isArray(p.user_id) ? p.user_id[1] : '',
          responsibleId: Array.isArray(p.user_id) ? p.user_id[0] : null,
          lineCount: linesByPicking[p.id] ?? 0,
        })),
      });
    }

    /* ── picking_stats_range ── */
    if (action === 'picking_stats_range') {
      const domainPick: unknown[] = [
        ['state', '=', 'done'],
        ['date_done', '>=', dateFrom + ' 00:00:00'],
        ['date_done', '<=', dateTo   + ' 23:59:59'],
        ['origin', 'ilike', 'Abastecimiento'],
        ['origin', 'not ilike', 'AUDITORIA'],
      ];

      // 1. Fetch all done pickings in range (user + timing)
      const rawPickings = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read', [domainPick], {
          fields: ['id', 'user_id', 'scheduled_date', 'date_done'],
          limit: 8000, order: 'id asc',
        }],
      })) as Array<{
        id: number;
        user_id: [number, string] | false;
        scheduled_date: string | false;
        date_done: string | false;
      }>;

      if (!rawPickings.length) {
        return NextResponse.json({ stats: [], dateFrom, dateTo });
      }

      const pickingIds = rawPickings.map(p => p.id);

      // 2. Get qty_done sum + line count per picking from stock.move.line
      const mlGroups = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.move.line', 'read_group',
          [
            [['picking_id', 'in', pickingIds], ['state', '=', 'done']],
            ['qty_done'],
            ['picking_id'],
          ],
          {},
        ],
      })) as Array<{ picking_id: [number, string] | false; qty_done: number; picking_id_count: number }>;

      const mlByPicking: Record<number, { units: number; lines: number }> = {};
      for (const g of mlGroups) {
        if (!Array.isArray(g.picking_id)) continue;
        mlByPicking[g.picking_id[0]] = { units: g.qty_done ?? 0, lines: g.picking_id_count ?? 0 };
      }

      // 3. Aggregate by user
      const byUser: Record<number, {
        name: string; ops: number;
        totalMinutes: number; units: number; lines: number;
      }> = {};

      for (const p of rawPickings) {
        if (!Array.isArray(p.user_id)) continue;
        const [userId, userName] = p.user_id;
        if (!byUser[userId]) byUser[userId] = { name: userName, ops: 0, totalMinutes: 0, units: 0, lines: 0 };
        const u = byUser[userId];
        u.ops++;
        if (typeof p.scheduled_date === 'string' && typeof p.date_done === 'string') {
          const diffMin = (new Date(p.date_done).getTime() - new Date(p.scheduled_date).getTime()) / 60_000;
          // Sólo contar duraciones razonables (> 0 y < 8h)
          if (diffMin > 0 && diffMin < 480) u.totalMinutes += diffMin;
        }
        const ml = mlByPicking[p.id];
        if (ml) { u.units += ml.units; u.lines += ml.lines; }
      }

      const stats = Object.values(byUser)
        .map(u => ({
          name:              u.name,
          ops:               u.ops,
          totalMinutes:      Math.round(u.totalMinutes),
          avgMinutesPerOp:   u.ops   > 0 ? Math.round(u.totalMinutes / u.ops)   : 0,
          units:             Math.round(u.units),
          lineCount:         u.lines,
          avgSecondsPerLine: u.lines > 0 ? Math.round((u.totalMinutes * 60) / u.lines) : 0,
          cph:               u.totalMinutes > 0 ? Math.round((u.units / u.totalMinutes) * 60) : 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return NextResponse.json({ stats, dateFrom, dateTo, total: rawPickings.length });
    }

    /* ── picking_check_state ── */
    if (action === 'picking_check_state') {
      if (!query) return NextResponse.json({ error: 'Referencia requerida' }, { status: 400 });
      const result = (await odooRpc(url, {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read',
          [[['name', '=', query]]],
          { fields: ['name', 'state', 'date_done'], limit: 1 },
        ],
      })) as Array<{ id: number; name: string; state: string; date_done: string | false }>;
      if (!result.length) return NextResponse.json({ error: 'Operación no encontrada' }, { status: 404 });
      return NextResponse.json({
        state: result[0].state,
        dateDone: typeof result[0].date_done === 'string' ? result[0].date_done : null,
      });
    }

    /* ── debug_messages_picking — todos los mail.message de un picking ── */
    if (action === 'debug_messages_picking') {
      if (!query) return NextResponse.json({ error: 'Pasa el nombre del picking en query' }, { status: 400 });

      // Buscar el picking por nombre para obtener su ID
      const picks = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read',
          [[['name', '=', query.trim()]]],
          { fields: ['id', 'name', 'state', 'scheduled_date', 'date_done', 'create_date', 'origin'], limit: 1 },
        ],
      })) as Array<Record<string, unknown>>;

      if (!picks.length) return NextResponse.json({ error: `Picking "${query}" no encontrado` });
      const pickId = picks[0].id as number;

      // Todos los mail.message del picking, con todos los campos útiles
      const allMessages = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'mail.message', 'search_read',
          [[['model', '=', 'stock.picking'], ['res_id', '=', pickId]]],
          {
            fields: [
              'id', 'date', 'create_date', 'message_type',
              'mail_activity_type_id', 'subtype_id',
              'author_id', 'body',
            ],
            limit: 100,
            order: 'date asc',
          },
        ],
      })) as Array<Record<string, unknown>>;

      // Actividades PENDIENTES actuales (no completadas aún) del mismo picking
      let pendingActivities: Array<Record<string, unknown>> = [];
      try {
        pendingActivities = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'mail.activity', 'search_read',
            [[['res_model', '=', 'stock.picking'], ['res_id', '=', pickId]]],
            { fields: ['id', 'create_date', 'date_deadline', 'activity_type_id', 'user_id', 'summary', 'state'], limit: 20 },
          ],
        })) as Array<Record<string, unknown>>;
      } catch { /* si no tiene actividades pendientes */ }

      return NextResponse.json({
        picking: picks[0],
        messages: allMessages,
        pendingActivities,
      });
    }

    /* ── debug_activities — diagnóstico completo ── */
    if (action === 'debug_activities') {
      // A. Todos los tipos registrados en mail.activity.type
      const allTypes = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'mail.activity.type', 'search_read',
          [[]],
          { fields: ['id', 'name'], limit: 50 },
        ],
      })) as Array<Record<string, unknown>>;

      // B. Actividades PENDIENTES en stock.picking (mail.activity)
      const pending = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'mail.activity', 'search_read',
          [[['res_model', '=', 'stock.picking']]],
          {
            fields: ['id', 'res_name', 'user_id', 'activity_type_id', 'summary', 'date_deadline'],
            limit: 100,
            order: 'id desc',
          },
        ],
      })) as Array<Record<string, unknown>>;

      // C. Actividades COMPLETADAS — mail.message con body
      let done: Array<Record<string, unknown>> = [];
      try {
        done = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'mail.message', 'search_read',
            [[
              ['model', '=', 'stock.picking'],
              ['mail_activity_type_id', '!=', false],
            ]],
            {
              fields: ['id', 'res_id', 'record_name', 'author_id',
                       'mail_activity_type_id', 'date', 'body'],
              limit: 100,
              order: 'id desc',
            },
          ],
        })) as Array<Record<string, unknown>>;
      } catch { done = [{ error: 'mail.message no accesible' }]; }

      // D. Verificar nombres reales de los tipos 26, 27, 28
      let typeDetail: Array<Record<string, unknown>> = [];
      try {
        typeDetail = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'mail.activity.type', 'search_read',
            [[['id', 'in', [26, 27, 28]]]],
            { fields: ['id', 'name', 'summary', 'category', 'res_model'], limit: 10 },
          ],
        })) as Array<Record<string, unknown>>;
      } catch { typeDetail = [{ error: 'No se pudo leer mail.activity.type para esos IDs' }]; }

      return NextResponse.json({ allTypes, pending, done, typeDetail });
    }

    /* ── debug_responsable — traza la cadena de un INT picking específico ── */
    if (action === 'debug_responsable') {
      // query = nombre del picking INT, ej: "20CTC/INT/03084"
      if (!query) return NextResponse.json({ error: 'Pasa el nombre del picking en query' }, { status: 400 });

      // 1. Obtener el picking INT
      const intPick = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read',
          [[['name', '=', query]]],
          { fields: ['id', 'name', 'origin', 'user_id', 'picking_type_id', 'group_id'], limit: 1 },
        ],
      })) as Array<Record<string, unknown>>;

      if (!intPick.length) return NextResponse.json({ error: `Picking "${query}" no encontrado` });

      const pickId = intPick[0].id as number;

      // 2. Moves del picking
      const moves = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.move', 'search_read',
          [[['picking_id', '=', pickId]]],
          { fields: ['id', 'name', 'move_orig_ids', 'picking_id'], limit: 20 },
        ],
      })) as Array<Record<string, unknown>>;

      // 3. move_orig_ids detail
      const origMoveIds = moves.flatMap(m => (m.move_orig_ids as number[]) ?? []);
      let origMoves: Array<Record<string, unknown>> = [];
      let origPickings: Array<Record<string, unknown>> = [];
      if (origMoveIds.length) {
        origMoves = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.move', 'read',
            [origMoveIds],
            { fields: ['id', 'name', 'picking_id', 'state'] },
          ],
        })) as Array<Record<string, unknown>>;

        const origPickIds = [...new Set(origMoves
          .map(m => Array.isArray(m.picking_id) ? (m.picking_id as [number,string])[0] : null)
          .filter((x): x is number => x !== null))];

        if (origPickIds.length) {
          origPickings = (await odooRpc(url, {
            service: 'object', method: 'execute_kw',
            args: [db, uid, apiKey, 'stock.picking', 'read',
              [origPickIds],
              { fields: ['id', 'name', 'user_id', 'picking_type_id', 'origin', 'state'] },
            ],
          })) as Array<Record<string, unknown>>;
        }
      }

      // 4. Pickings con el mismo origen (misma referencia de abastecimiento)
      const origin = intPick[0].origin as string | false;
      let sameOriginPickings: Array<Record<string, unknown>> = [];
      if (origin) {
        sameOriginPickings = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking', 'search_read',
            [[['origin', '=', origin], ['id', '!=', pickId]]],
            { fields: ['id', 'name', 'user_id', 'picking_type_id', 'state'], limit: 10 },
          ],
        })) as Array<Record<string, unknown>>;
      }

      // Parseo de referencias del origin (igual que en get_control_activities)
      const rawOrigin = (intPick[0].origin as string) ?? '';
      const parsedRefs = rawOrigin.match(/[A-Z0-9]+(?:\/[A-Z0-9]+)+/g)
        ?? rawOrigin.split(',').map(r => r.trim()).filter(Boolean);

      // Buscar esos pickings por name
      let parentByName: Array<Record<string, unknown>> = [];
      if (parsedRefs.length) {
        parentByName = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking', 'search_read',
            [[['name', 'in', parsedRefs]]],
            {
              fields: ['id', 'name', 'state', 'user_id', 'responsible_id', 'owner_id',
                       'date_done', 'location_id', 'location_dest_id', 'picking_type_id'],
              limit: 20,
            },
          ],
        })) as Array<Record<string, unknown>>;
      }

      return NextResponse.json({
        intPick: intPick[0], rawOrigin, parsedRefs,
        parentByName, moves, origMoves, origPickings, sameOriginPickings,
      });
    }

    /* ── get_control_activities ── */
    // Filtra pickings INT/MERMA por date_done en rango (fechaArmado).
    // Si incluyePendientes=true, también incluye pickings pendientes (scheduled_date en rango)
    // y sus mail.activity con estado VENCIDA/PLANIFICADO.
    if (action === 'get_control_activities') {

      // ── Helpers de parseo de body ──────────────────────────────────────
      function stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '\n')
                   .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                   .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                   .replace(/\n+/g, '\n').trim();
      }
      function parseDetalle(html: string): string {
        // 1) <span ...>Faltantes</span> (con o sin atributos)
        const m1 = html.match(/<span[^>]*>(Faltantes|Sobrantes|Merma)<\/span>/i);
        if (m1) return m1[1];
        // 2) Cualquier tag: <b>Faltantes</b>, <em>Faltantes</em>, etc.
        const m2 = html.match(/<(?:b|strong|em|i|u|span|div|p)[^>]*>(Faltantes|Sobrantes|Merma)<\/(?:b|strong|em|i|u|span|div|p)>/i);
        if (m2) return m2[1];
        // 3) Texto plano sin tags (después de strip HTML)
        const text = stripHtml(html);
        const m3 = text.match(/\b(Faltantes|Sobrantes|Merma)\b/i);
        return m3 ? m3[1] : '';
      }
      function parseMovAjuste(html: string): string {
        const text = stripHtml(html);
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const idx = lines.findIndex(l => /ajuste\s*(realizado)?|ajustado/i.test(l));
        if (idx >= 0) {
          for (let i = idx + 1; i < Math.min(idx + 4, lines.length); i++) {
            if (/[A-Z0-9]+\/[A-Z]+\/\d+/i.test(lines[i])) return lines[i].trim();
          }
        }
        return '';
      }
      // ────────────────────────────────────────────────────────────────────

      const incluyePendientes = body.incluyePendientes === true;
      const dateFromStr = dateFrom + ' 00:00:00';
      const dateToStr   = dateTo   + ' 23:59:59';
      const today       = localDateStr(new Date());

      // 1. Tipos de actividad dinámicos (Faltantes/Sobrantes/Merma)
      //    Búsqueda flexible: trae todos los types y filtra en JS por keywords.
      let actTypeIds: number[] = [];
      const typeNameMap = new Map<number, string>();
      const DETALLE_KEYWORDS = ['faltante', 'sobrante', 'merma'];
      try {
        const allActTypes = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'mail.activity.type', 'search_read',
            [[]],
            { fields: ['id', 'name'], limit: 100 },
          ],
        })) as Array<{ id: number; name: string }>;
        const matched = allActTypes.filter(t =>
          DETALLE_KEYWORDS.some(kw => (t.name ?? '').toLowerCase().includes(kw))
        );
        actTypeIds = matched.map(t => t.id);
        for (const t of matched) typeNameMap.set(t.id, t.name);
        console.log(`[get_control_activities] activity types encontrados: ${matched.map(t => `${t.id}=${t.name}`).join(', ') || 'NINGUNO'} (total en Odoo: ${allActTypes.length})`);
      } catch (err) {
        console.error('[get_control_activities] error obteniendo tipos:', err);
      }

      // 2a. Pickings INT/MERMA completados en rango de date_done
      type PickingRecord = {
        id: number; name: string;
        user_id: [number, string] | false;
        origin: string | false; state: string;
        date_done: string | false; scheduled_date: string | false; create_date: string;
      };

      const completedPickings = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read',
          [['|', ['name', 'like', '/INT/'], ['name', 'like', '/MERMA/'],
            ['state', '=', 'done'],
            ['date_done', '>=', dateFromStr],
            ['date_done', '<=', dateToStr],
          ]],
          {
            fields: ['id', 'name', 'user_id', 'origin', 'state',
                     'date_done', 'scheduled_date', 'create_date'],
            limit: 2000,
          },
        ],
      })) as PickingRecord[];

      // 2b. Pickings INT/MERMA pendientes en rango de scheduled_date (si incluyePendientes)
      let pendingPickings: PickingRecord[] = [];
      if (incluyePendientes) {
        pendingPickings = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking', 'search_read',
            [['|', ['name', 'like', '/INT/'], ['name', 'like', '/MERMA/'],
              ['state', 'not in', ['done', 'cancel']],
              ['scheduled_date', '>=', dateFromStr],
              ['scheduled_date', '<=', dateToStr],
            ]],
            {
              fields: ['id', 'name', 'user_id', 'origin', 'state',
                       'date_done', 'scheduled_date', 'create_date'],
              limit: 2000,
            },
          ],
        })) as PickingRecord[];
      }

      // Combinar y deduplicar
      const pickingMap = new Map<number, PickingRecord>();
      for (const p of [...completedPickings, ...pendingPickings]) {
        if (!pickingMap.has(p.id)) pickingMap.set(p.id, p);
      }
      const completedPickingIds = new Set(completedPickings.map(p => p.id));
      const allPickingIds = [...pickingMap.keys()];

      if (!allPickingIds.length) return NextResponse.json({ rows: [], total: 0 });

      // 3. Resolver filtro de usuario → partnerIds (mail.message) + userIds (mail.activity)
      let filterPartnerIds: number[] | null = null;
      let filterUserIds: number[] | null = null;

      if (query && query.trim()) {
        const matchUsers = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'res.users', 'search_read',
            [[['name', 'ilike', query.trim()]]],
            { fields: ['id', 'partner_id'], limit: 10 },
          ],
        })) as Array<{ id: number; partner_id: [number, string] | false }>;

        if (matchUsers.length) {
          filterUserIds = matchUsers.map(u => u.id);
          filterPartnerIds = matchUsers
            .map(u => Array.isArray(u.partner_id) ? u.partner_id[0] : null)
            .filter((id): id is number => id !== null);
        }
      }

      // 4a. Actividades COMPLETADAS — mail.message con activity type
      const msgDomain: unknown[] = [
        ['model', '=', 'stock.picking'],
        ['res_id', 'in', [...completedPickingIds]],
        ['mail_activity_type_id', '!=', false],
      ];
      if (actTypeIds.length)          msgDomain.push(['mail_activity_type_id', 'in', actTypeIds]);
      if (filterPartnerIds?.length)   msgDomain.push(['author_id', 'in', filterPartnerIds]);

      const messages = (await odooRpc(url, {
        service: 'object', method: 'execute_kw',
        args: [db, uid, apiKey, 'mail.message', 'search_read',
          [msgDomain],
          {
            fields: ['id', 'res_id', 'record_name', 'author_id',
                     'mail_activity_type_id', 'date', 'body'],
            limit: 2000, order: 'id desc',
          },
        ],
      })) as Array<{
        id: number; res_id: number; record_name: string;
        author_id: [number, string] | false;
        mail_activity_type_id: [number, string] | false;
        date: string; body: string;
      }>;

      type ParsedEntry = {
        msgId: number; pickingId: number; pickingName: string;
        storeCod: string; detalle: string; movAjuste: string;
        authorName: string; estado: 'COMPLETADO' | 'VENCIDA' | 'PLANIFICADO';
      };
      const parsed: ParsedEntry[] = [];

      for (const msg of messages) {
        const detalle = parseDetalle(msg.body ?? '');
        if (!detalle) {
          console.log(`[get_control_activities] msg ${msg.id} picking=${msg.record_name} sin detalle, body preview: ${(msg.body ?? '').substring(0, 150)}`);
          continue;
        }
        const pickingName = msg.record_name ?? '';
        parsed.push({
          msgId:      msg.id,
          pickingId:  msg.res_id,
          pickingName,
          storeCod:   pickingName.split('/')[0] ?? '',
          detalle,
          movAjuste:  parseMovAjuste(msg.body ?? ''),
          authorName: Array.isArray(msg.author_id) ? msg.author_id[1] : '',
          estado:     'COMPLETADO',
        });
      }

      // 4b. Actividades PENDIENTES — mail.activity (si incluyePendientes)
      let pendingActivitiesCount = 0;
      if (incluyePendientes && allPickingIds.length) {
        const actDomain: unknown[] = [
          ['res_model', '=', 'stock.picking'],
          ['res_id', 'in', allPickingIds],
        ];
        if (actTypeIds.length)        actDomain.push(['activity_type_id', 'in', actTypeIds]);
        if (filterUserIds?.length)    actDomain.push(['user_id', 'in', filterUserIds]);

        const pendingActivities = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'mail.activity', 'search_read',
            [actDomain],
            {
              fields: ['id', 'res_id', 'res_name', 'user_id',
                       'activity_type_id', 'summary', 'note', 'date_deadline'],
              limit: 2000,
            },
          ],
        })) as Array<{
          id: number; res_id: number; res_name: string | false;
          user_id: [number, string] | false;
          activity_type_id: [number, string] | false;
          summary: string | false; note: string | false;
          date_deadline: string | false;
        }>;

        for (const act of pendingActivities) {
          const typeId   = Array.isArray(act.activity_type_id) ? act.activity_type_id[0] : 0;
          // Solo usar el nombre del tipo si está en nuestro mapa de keywords.
          // activity_type_id[1] puede devolver nombres genéricos como "To Do" que no son detalles válidos.
          const typeName = typeNameMap.get(typeId) ?? '';
          const detalle = typeName
            || parseDetalle(typeof act.summary === 'string' ? act.summary : '')
            || parseDetalle(typeof act.note === 'string' ? act.note : '');
          if (!detalle) continue;

          // Usar nombre del picking desde el mapa (ya traído en paso 2)
          const pickingName =
            pickingMap.get(act.res_id)?.name
            ?? (typeof act.res_name === 'string' ? act.res_name : '')
            ?? '';

          const deadline = typeof act.date_deadline === 'string' ? act.date_deadline : '';
          const estado: 'VENCIDA' | 'PLANIFICADO' =
            (deadline && deadline < today) ? 'VENCIDA' : 'PLANIFICADO';

          parsed.push({
            msgId:      act.id,
            pickingId:  act.res_id,
            pickingName,
            storeCod:   pickingName.split('/')[0] ?? '',
            detalle:    detalle,
            movAjuste:  typeof act.note === 'string' ? parseMovAjuste(act.note) : '',
            authorName: Array.isArray(act.user_id) ? act.user_id[1] : '',
            estado,
          });
        }
        pendingActivitiesCount = pendingActivities.length;
        console.log(`[get_control_activities] pending: ${pendingActivities.length} total, ${parsed.filter(p => p.estado !== 'COMPLETADO').length} parseados OK`);
      }

      if (!parsed.length) return NextResponse.json({ rows: [], total: 0 });

      // 5. Responsable Armado — cadena: INT picking → stock.move (move_orig_ids) →
      //    picking padre (ej: 99REC/DT/97060) → user_id del picker.
      const parsedPickingIds  = [...new Set(parsed.map(m => m.pickingId))];
      const respMap           = new Map<number, string>();
      const parentOriginMap   = new Map<number, string>();
      const parentDateDoneMap = new Map<number, string>();
      try {
        const intMoves = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.move', 'search_read',
            [[['picking_id', 'in', parsedPickingIds], ['move_orig_ids', '!=', false]]],
            { fields: ['id', 'picking_id', 'move_orig_ids'], limit: 99999 },
          ],
        })) as Array<{ id: number; picking_id: [number, string] | false; move_orig_ids: number[] }>;

        const origIdsByPicking = new Map<number, number[]>();
        for (const m of intMoves) {
          if (!Array.isArray(m.move_orig_ids) || !m.move_orig_ids.length) continue;
          const pid = Array.isArray(m.picking_id) ? m.picking_id[0] : null;
          if (!pid) continue;
          origIdsByPicking.set(pid, (origIdsByPicking.get(pid) ?? []).concat(m.move_orig_ids));
        }

        const allOrigIds = [...new Set([...origIdsByPicking.values()].flat())];
        if (allOrigIds.length) {
          const origMoves = (await odooRpc(url, {
            service: 'object', method: 'execute_kw',
            args: [db, uid, apiKey, 'stock.move', 'read',
              [allOrigIds],
              { fields: ['id', 'picking_id'] },
            ],
          })) as Array<{ id: number; picking_id: [number, string] | false }>;

          const origMoveToParentPick = new Map<number, number>();
          for (const om of origMoves) {
            if (Array.isArray(om.picking_id)) origMoveToParentPick.set(om.id, om.picking_id[0]);
          }

          const parentPickingIds = [...new Set(origMoveToParentPick.values())];
          if (parentPickingIds.length) {
            const parentPickings = (await odooRpc(url, {
              service: 'object', method: 'execute_kw',
              args: [db, uid, apiKey, 'stock.picking', 'read',
                [parentPickingIds],
                { fields: ['id', 'name', 'user_id', 'origin', 'date_done'] },
              ],
            })) as Array<{ id: number; name: string; user_id: [number, string] | false; origin: string | false; date_done: string | false }>;

            const parentPickMap = new Map(parentPickings.map(pp => [pp.id, pp]));

            for (const [pickId, origIds] of origIdsByPicking) {
              for (const oid of origIds) {
                const parentPickId = origMoveToParentPick.get(oid);
                if (!parentPickId) continue;
                const pp = parentPickMap.get(parentPickId);
                if (!pp || !Array.isArray(pp.user_id)) continue;
                if (pp.name.includes('/INT/')) continue;
                respMap.set(pickId, pp.user_id[1]);
                parentOriginMap.set(pickId, typeof pp.origin === 'string' ? pp.origin : '');
                if (typeof pp.date_done === 'string') parentDateDoneMap.set(pickId, pp.date_done);
                break;
              }
            }
          }
        }
      } catch (err) {
        console.error('[get_control_activities] error en paso 5 (move_orig_ids):', err);
      }

      // 6. Construir filas finales
      const rows = parsed.map(m => {
        const p = pickingMap.get(m.pickingId);
        const responsableRaw =
          respMap.get(m.pickingId)
          ?? (p && Array.isArray(p.user_id) ? p.user_id[1] : '');
        const parentOrigin = parentOriginMap.get(m.pickingId) ?? '';
        const esAuditoria  = /^auditoria/i.test(parentOrigin);

        const fechaArmado =
          parentDateDoneMap.get(m.pickingId)
          ?? (p && typeof p.date_done === 'string' ? p.date_done : null)
          ?? (p && typeof p.scheduled_date === 'string' ? p.scheduled_date : null)
          ?? p?.create_date ?? '';

        const fechaDeclaracion =
          (p && typeof p.date_done === 'string' ? p.date_done : null)
          ?? p?.create_date ?? null;

        return {
          activityId:        m.msgId,
          pickingId:         m.pickingId,
          pickingName:       m.pickingName,
          storeCod:          m.storeCod,
          responsableArmado: esAuditoria ? '' : responsableRaw,
          fechaArmado,
          fechaDeclaracion,
          detalle:           m.detalle,
          movAjuste:         m.movAjuste,
          origin:            p && typeof p.origin === 'string' ? p.origin : '',
          state:             p?.state ?? '',
          auditado:          esAuditoria ? 'SI' : 'NO',
          auditorName:       esAuditoria ? responsableRaw : '',
          estado:            m.estado,
        };
      });

      const truncated =
        completedPickings.length === 2000 ||
        pendingPickings.length   === 2000 ||
        messages.length          === 2000 ||
        (incluyePendientes && pendingActivitiesCount === 2000);

      return NextResponse.json({ rows, total: rows.length, truncated });
    }

    /* ── store_movement_status ── */
    if (action === 'store_movement_status') {
      const now = new Date();
      const todayStr = localDateStr(now);

      let pickingTypeIds: number[] = [];
      try {
        const ptRows = (await odooRpc(url, {
          service: 'object', method: 'execute_kw',
          args: [db, uid, apiKey, 'stock.picking.type', 'search_read',
            [[['name', 'ilike', 'Despacho Tiendas']]],
            { fields: ['id'], limit: 10 },
          ],
        })) as Array<{ id: number }>;
        pickingTypeIds = ptRows.map(r => r.id);
      } catch { /* skip */ }

      const domain: unknown[] = [
        ['state', 'not in', ['draft', 'cancel']],
        ['scheduled_date', '>=', todayStr + ' 00:00:00'],
        ['scheduled_date', '<=', todayStr + ' 23:59:59'],
        ['origin', 'not ilike', 'AUDITORIA'],
      ];
      if (pickingTypeIds.length > 0) {
        domain.push(['picking_type_id', 'in', pickingTypeIds]);
      } else {
        domain.push(['origin', 'ilike', 'Abastecimiento']);
      }

      const pickings = (await odooRpc(url, {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.picking', 'search_read', [domain], {
          fields: ['origin', 'state'],
          limit: 500,
        }],
      })) as Array<{ origin: string | false; state: string }>;

      const byStore: Record<string, { total: number; done: number }> = {};
      const storeNameRe = /Abastecimiento\s+\S+\s+(\S+)/i;
      for (const p of pickings) {
        const origin = typeof p.origin === 'string' ? p.origin : '';
        const m = origin.match(storeNameRe);
        const cod = m ? m[1].toUpperCase().replace(/[^A-Z0-9]/g, '') : origin.replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
        if (!cod) continue;
        if (!byStore[cod]) byStore[cod] = { total: 0, done: 0 };
        byStore[cod].total++;
        if (p.state === 'done') byStore[cod].done++;
      }

      const result = Object.entries(byStore).map(([cod, { total, done }]) => ({
        cod, total, done,
        status: total === 0 ? 'none' as const : done === total ? 'complete' as const : 'partial' as const,
      }));
      return NextResponse.json({ stores: result });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al conectar con Odoo';
    console.error('[/api/odoo]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
