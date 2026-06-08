import { NextRequest, NextResponse } from 'next/server';

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
  try {
    const body = (await req.json()) as {
      action: string;
      config: { url: string; db: string; username: string; apiKey: string };
      query?: string;
      pickings?: string[];
    };
    const { action, config, query = '', pickings = [] } = body;
    const dateFrom = (body as { dateFrom?: string }).dateFrom ?? '2026-05-01';
    const dateTo   = (body as { dateTo?:   string }).dateTo   ?? '2026-05-31';
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
        domain.push(['origin', 'ilike', storeCod]);
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

    /* ── picking_move_products: primeras líneas de producto por movimiento ── */
    if (action === 'picking_move_products') {
      const ids = pickings.map(n => Number(n)).filter(n => !isNaN(n));
      if (ids.length === 0) return NextResponse.json({ products: {} });

      const moves = (await odooRpc(url, {
        service: 'object',
        method: 'execute_kw',
        args: [db, uid, apiKey, 'stock.move', 'search_read',
          [[['picking_id', 'in', ids]]],
          { fields: ['picking_id', 'product_id', 'product_uom_qty'], limit: 1000, order: 'id asc' },
        ],
      })) as Array<{
        picking_id: [number, string] | false;
        product_id: [number, string] | false;
        product_uom_qty: number;
      }>;

      // Agrupar por picking_id → lista de { nombre, qty }
      const products: Record<number, { nombre: string; qty: number }[]> = {};
      for (const mv of moves) {
        if (!Array.isArray(mv.picking_id)) continue;
        const pid = mv.picking_id[0];
        if (!products[pid]) products[pid] = [];
        products[pid].push({
          nombre: Array.isArray(mv.product_id) ? mv.product_id[1] : '—',
          qty:    typeof mv.product_uom_qty === 'number' ? mv.product_uom_qty : 0,
        });
      }
      return NextResponse.json({ products });
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
