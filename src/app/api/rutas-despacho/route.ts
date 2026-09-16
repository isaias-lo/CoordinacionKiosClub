import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { upsertTrazabilidadSheet } from '@/lib/sheetsTraza';
import { verifyAuth } from '@/lib/apiAuth';
import { norm } from '@/features/despacho/rutas/utils/helpers';
import { ESTADO_TO_SEGUIMIENTO, syncSeguimientoDespacho } from './seguimientoSync';
import { fechaChile } from '@/lib/fechaChile';
import { verifyOtpToken } from '@/lib/otpToken';

/** Suma `n` días a una fecha ISO YYYY-MM-DD (DST-safe vía UTC). */
function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // [Panel Conductor · Fase 4] Historial: un resumen por día (rutas, paradas, entregadas) de los
  // últimos `dias` días de un chofer, para la pantalla de historial — NO el detalle completo de
  // cada ruta (eso sigue siendo el modo normal de este mismo GET, con `fecha` puntual). Se agrega
  // acá en vez de un endpoint nuevo por lo mismo que ya se hizo con el PATCH en la Fase 0: es el
  // mismo recurso, otra vista de él.
  if (request.nextUrl.searchParams.get('historial') === '1') {
    const patente = request.nextUrl.searchParams.get('patente');
    if (!patente) return NextResponse.json({ error: 'patente requerida' }, { status: 400 });
    const dias  = Math.min(60, Math.max(1, parseInt(request.nextUrl.searchParams.get('dias') ?? '14', 10) || 14));
    // Excluye HOY: la pestaña "Mi Ruta" ya lo cubre en vivo — el historial es "días anteriores".
    const hasta = addDaysIso(fechaChile(), -1);
    const desde = addDaysIso(fechaChile(), -dias);

    const { data, error } = await supabaseServer()
      .from('rutas_despacho')
      .select('fecha, ruta_tiendas(estado_entrega)')
      .ilike('patente', patente.trim())
      .gte('fecha', desde)
      .lte('fecha', hasta);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Se agrupa en JS, no en SQL: el volumen por chofer es chico (un par de rutas/día, unas pocas
    // paradas cada una) y el query-builder de supabase-js no expone GROUP BY/agregados — traer las
    // filas y sumar acá es más simple que una función RPC para un caso de bajo volumen.
    const porFecha = new Map<string, { rutas: number; paradas: number; entregadas: number }>();
    for (const r of (data ?? []) as { fecha: string; ruta_tiendas?: { estado_entrega: string }[] }[]) {
      const cur = porFecha.get(r.fecha) ?? { rutas: 0, paradas: 0, entregadas: 0 };
      const paradas = r.ruta_tiendas ?? [];
      cur.rutas += 1;
      cur.paradas += paradas.length;
      cur.entregadas += paradas.filter(p => p.estado_entrega === 'entregado').length;
      porFecha.set(r.fecha, cur);
    }
    const historialData = [...porFecha.entries()]
      .map(([fecha, v]) => ({ fecha, ...v }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    return NextResponse.json({ data: historialData });
  }

  const fecha   = request.nextUrl.searchParams.get('fecha') ?? fechaChile();
  const patente = request.nextUrl.searchParams.get('patente');

  let query = supabaseServer()
    .from('rutas_despacho')
    .select('*, ruta_tiendas(*), ruta_guias(*)')
    .eq('fecha', fecha)
    .order('created_at', { ascending: true });

  if (patente) query = query.ilike('patente', patente.trim());

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // [Panel Conductor] `ruta_tiendas` no trae dirección — solo vive en el catálogo `tiendas`. Sin
  // esto, el chofer ve el nombre y el código de cada parada pero no adónde ir. Mismo patrón de
  // join que ya usa GET /api/r/[token] (batch por `codigo`, no un fetch por tienda).
  const rutas = (data ?? []) as { ruta_tiendas?: { store_cod: string }[] }[];
  const cods = [...new Set(rutas.flatMap(r => (r.ruta_tiendas ?? []).map(t => t.store_cod)))];
  if (cods.length) {
    const { data: tiendaRows } = await supabaseServer()
      .from('tiendas')
      .select('codigo, direccion, sector_comuna')
      .in('codigo', cods);
    const dirByCod = new Map((tiendaRows ?? []).map((t: { codigo: string; direccion: string | null; sector_comuna: string | null }) =>
      [t.codigo, { direccion: t.direccion, comuna: t.sector_comuna }]));
    for (const r of rutas) {
      for (const t of (r.ruta_tiendas ?? []) as unknown as Record<string, unknown>[]) {
        const d = dirByCod.get(t.store_cod as string);
        t.direccion = d?.direccion ?? null;
        t.comuna    = d?.comuna ?? null;
      }
    }
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as {
    fecha: string; fecha_salida?: string | null; codigo_ruta: string; chofer: string; patente: string;
    bodega_origen?: string;
    pioneta_1?: string;
    pioneta_2?: string;
    tipo_carga?: string;
    regimen?:    string;
    /** [Panel Conductor] 'seco' | 'congelado' — decide qué fotos pide el chofer por parada.
     *  Distinto de `tipo_carga`/`regimen` (esos van solo a `trazabilidad_unidades`). */
    tipo?: 'seco' | 'congelado';
    usuario_creador?: string;
    tiendas?: { store_cod: string; nombre?: string; ventana?: string; orden: number; pallets: number; bultos: number; contenedores?: number }[];
    guias?:   { store_cod?: string; folio_dte: string; drive_url?: string }[];
  };

  const token    = crypto.randomUUID();
  // Vigencia del QR Maestro para fiscalización: 30 días (antes 48h, muy corto para auditar
  // después). El token es un UUID no adivinable, así que extenderlo es de bajo riesgo.
  const tokenExp = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Idempotencia por (fecha, codigo_ruta). El panel ahora acumula los manifiestos del día y
  // "Guardar (N)" persiste varios de golpe, así que un doble clic o un reintento de red podía
  // crear filas duplicadas (el insert es plano y no hay unique en la tabla). Si el manifiesto ya
  // existe se reutiliza — conservando su `token_qr`, para que el QR ya impreso siga sirviendo.
  const { data: existente } = await supabaseServer()
    .from('rutas_despacho')
    .select('*')
    .eq('fecha', body.fecha)
    .eq('codigo_ruta', body.codigo_ruta)
    .maybeSingle();

  if (existente) {
    // Si quedó a medias (ruta creada pero sin tiendas, p. ej. por un error en el insert de
    // `ruta_tiendas`), se completan; si ya están, no se toca nada.
    const { count } = await supabaseServer()
      .from('ruta_tiendas')
      .select('id', { count: 'exact', head: true })
      .eq('ruta_id', existente.id);
    if (!count && body.tiendas?.length) {
      await supabaseServer().from('ruta_tiendas').insert(body.tiendas.map(t => ({
        ruta_id:      existente.id,
        store_cod:    t.store_cod,
        nombre:       t.nombre   ?? null,
        ventana:      t.ventana  ?? null,
        orden:        t.orden,
        pallets:      t.pallets,
        bultos:       t.bultos,
        contenedores: t.contenedores ?? 0,
      })));
    }
    return NextResponse.json({ data: existente, idempotent: true });
  }

  const { data: ruta, error: rutaErr } = await supabaseServer()
    .from('rutas_despacho')
    .insert({
      fecha:          body.fecha,
      // Día de llegada a tienda. `fecha` sigue siendo el de ARMADO: de ahí cuelgan codigo_ruta,
      // la búsqueda por día y la ventana de guías. Ver la migración add_fecha_salida_a_rutas_despacho.
      fecha_salida:   body.fecha_salida ?? null,
      codigo_ruta:    body.codigo_ruta,
      chofer:         body.chofer,
      chofer_original: body.chofer,  // snapshot at creation
      patente:        body.patente,
      bodega_origen:  body.bodega_origen ?? 'Santiago',
      estado:         'pendiente',
      tipo:           body.tipo ?? 'seco',
      token_qr:       token,
      token_exp:      tokenExp,
      pioneta_1:      body.pioneta_1 ?? null,
      pioneta_2:      body.pioneta_2 ?? null,
    })
    .select()
    .single();
  if (rutaErr) return NextResponse.json({ error: rutaErr.message }, { status: 500 });

  if (body.tiendas?.length) {
    const { error: tErr } = await supabaseServer()
      .from('ruta_tiendas')
      .insert(body.tiendas.map(t => ({
        ruta_id:      ruta.id,
        store_cod:    t.store_cod,
        nombre:       t.nombre   ?? null,
        ventana:      t.ventana  ?? null,
        orden:        t.orden,
        pallets:      t.pallets,
        bultos:       t.bultos,
        contenedores: t.contenedores ?? 0,
      })));
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    // Guardar el manifiesto = tiendas asignadas y listas → avanzar seguimiento Registrado →
    // Pendiente en despacho_rm/regiones. Antes el POST solo creaba la ruta 'pendiente' pero NO
    // tocaba despacho_rm, así que el panel Estado se quedaba en 'Registrado' hasta pulsar
    // "Actualizar estado" a mano. `soloDesdeRegistrado` evita regresar rutas ya despachadas.
    // La fecha se resuelve por tienda adentro (armado vs salida), no se pasa la del manifiesto.
    await syncSeguimientoDespacho(supabaseServer(), body.tiendas.map(t => t.store_cod), 'Pendiente', true);
  }

  const guiasManuales = new Set<string>();
  if (body.guias?.length) {
    body.guias.forEach(g => { if (g.store_cod) guiasManuales.add(norm(g.store_cod)); });
    const { error: gErr } = await supabaseServer()
      .from('ruta_guias')
      .insert(body.guias.map(g => ({
        ruta_id:   ruta.id,
        store_cod: g.store_cod ? norm(g.store_cod) : null,
        folio_dte: g.folio_dte,
        drive_url: g.drive_url ?? null,
      })));
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });
  }

  // "Jalar" las guías ya subidas en bodega (Santiago/Regiones) antes de existir el
  // manifiesto: por cada tienda, la subida más reciente dentro de una ventana de
  // días alrededor de la fecha de salida. Cubre el caso "armado hoy / sale mañana".
  if (body.tiendas?.length) {
    const sbg = supabaseServer();
    const codsNorm = [...new Set(body.tiendas.map(t => norm(t.store_cod)))]
      .filter(c => !guiasManuales.has(c));  // no pisar las pasadas explícitamente
    if (codsNorm.length) {
      const desde = addDaysIso(body.fecha, -2);
      const hasta = addDaysIso(body.fecha, 1);
      const { data: subidas } = await sbg
        .from('guias_subidas')
        .select('store_cod, folios, drive_url, fecha, created_at')
        .in('store_cod', codsNorm)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false });

      // Quedarse con la subida más reciente por tienda
      const masReciente = new Map<string, { folios: string[]; drive_url: string | null }>();
      for (const s of (subidas ?? []) as { store_cod: string; folios: string[]; drive_url: string | null }[]) {
        if (!masReciente.has(s.store_cod)) masReciente.set(s.store_cod, { folios: s.folios ?? [], drive_url: s.drive_url });
      }

      const rows = [...masReciente.entries()].flatMap(([cod, g]) =>
        (g.folios ?? []).map(folio => ({
          ruta_id: ruta.id, store_cod: cod, folio_dte: folio, drive_url: g.drive_url ?? null, tipo: 'original',
        })),
      );
      if (rows.length) await sbg.from('ruta_guias').insert(rows);
    }
  }

  // ── Backfill de drive_url para guías MANUALES sin PDF ──────────────────────
  // Las guías de `body.guias` que llegaron con folio pero sin drive_url bloqueaban el
  // jalado de guias_subidas (su tienda quedaba en `guiasManuales`). Si esa tienda SÍ
  // tiene un PDF subido, lo adjuntamos a sus filas de ruta_guias que quedaron en null.
  // (Caso 23PEÑ: folio manual sin URL → no aparecía "Descargar PDF" en el QR.)
  if (guiasManuales.size) {
    const sbb = supabaseServer();
    const desde = addDaysIso(body.fecha, -2);
    const hasta = addDaysIso(body.fecha, 1);
    const { data: subidas } = await sbb
      .from('guias_subidas')
      .select('store_cod, drive_url, created_at')
      .in('store_cod', [...guiasManuales])
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .not('drive_url', 'is', null)
      .order('created_at', { ascending: false });

    const urlByStore = new Map<string, string>();
    for (const s of (subidas ?? []) as { store_cod: string; drive_url: string }[]) {
      if (!urlByStore.has(s.store_cod)) urlByStore.set(s.store_cod, s.drive_url);
    }
    for (const [cod, url] of urlByStore) {
      await sbb.from('ruta_guias')
        .update({ drive_url: url })
        .eq('ruta_id', ruta.id)
        .eq('store_cod', cod)
        .is('drive_url', null);
    }
  }

  // ── Crear registros en trazabilidad_unidades (PUNTO 1 — Creación) ──
  // Enriquecer con datos de tiendas para caché de destino
  if (body.tiendas?.length) {
    const sb2 = supabaseServer();
    const cods = [...new Set(body.tiendas.map(t => t.store_cod))];
    const { data: tiendaRows } = await sb2
      .from('tiendas')
      .select('codigo, nombre, tipo, sector_comuna, region, direccion, ventana')
      .in('codigo', cods);

    const tiendaMap = Object.fromEntries(
      (tiendaRows ?? []).map((t: {
        codigo: string; nombre: string; tipo: string;
        sector_comuna: string; region: string; direccion: string; ventana: string;
      }) => [t.codigo, t])
    );

    // Guía por store_cod (primera coincidencia)
    const guiaMap: Record<string, string> = {};
    (body.guias ?? []).forEach(g => {
      if (g.store_cod && !guiaMap[g.store_cod]) guiaMap[g.store_cod] = g.folio_dte;
    });

    // Una fila por tipo de unidad por tienda (donde cantidad > 0)
    const trazRows: Record<string, unknown>[] = [];
    for (const t of body.tiendas) {
      const tienda = tiendaMap[t.store_cod] as {
        nombre?: string; tipo?: string; sector_comuna?: string;
        region?: string; direccion?: string; ventana?: string;
      } | undefined;

      const base = {
        origen:                    body.bodega_origen ?? 'Santiago',
        codigo_tienda:             t.store_cod,
        tienda_destino:            tienda?.nombre  ?? null,
        tipo_tienda:               tienda?.tipo    ?? null,
        comuna_destino:            tienda?.sector_comuna ?? null,
        region_destino:            tienda?.region  ?? null,
        direccion_tienda:          tienda?.direccion ?? null,
        ventana_horaria_recepcion: tienda?.ventana ?? null,
        transportista:             body.chofer,
        tipo_carga:                body.tipo_carga  ?? null,
        regimen:                   body.regimen     ?? null,
        numero_guia:               guiaMap[t.store_cod] ?? null,
        usuario_creador:           body.usuario_creador ?? null,
        ruta_id:                   ruta.id,
        estado_actual:             'CREADO',
        origen_carga:              'manual',
      };

      if (t.pallets > 0) {
        trazRows.push({ ...base, id_unidad_logistica: crypto.randomUUID(), tipo_unidad: 'Pallet' });
      }
      if (t.bultos > 0) {
        trazRows.push({ ...base, id_unidad_logistica: crypto.randomUUID(), tipo_unidad: 'Bulto' });
      }
      if ((t.contenedores ?? 0) > 0) {
        trazRows.push({ ...base, id_unidad_logistica: crypto.randomUUID(), tipo_unidad: 'Contenedor' });
      }
    }

    if (trazRows.length) {
      // fire-and-forget — no bloquea la respuesta al cliente
      void sb2.from('trazabilidad_unidades').insert(trazRows);

      // Mirror a Google Sheets (fire-and-forget)
      trazRows.forEach(row => {
        upsertTrazabilidadSheet(row as Parameters<typeof upsertTrazabilidadSheet>[0]).catch(() => {});
      });
    }
  }

  return NextResponse.json({ data: ruta });
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as {
    id?: number; estado?: string;
    /** [Panel Conductor] Reordenar las paradas de una ruta — el chofer conoce el terreno mejor
     *  que la sugerencia (tráfico, corte de calle). `orden` es la lista de store_cod en el orden
     *  NUEVO; el servidor asigna 1..N según su posición. */
    ruta_id?: number; orden?: string[];
    /** [Panel Conductor] Marcar UNA parada como entregada, con sus fotos y hora real — distinto
     *  del PATCH de `estado` de más abajo, que toca TODAS las paradas de la ruta de una vez. */
    ruta_tienda_id?: number; foto_urls?: string[]; temperatura?: number;
    /** [Panel Conductor · Fase 4] Hora REAL en que el chofer registró la entrega, para la cola
     *  offline: si no hubo señal, esta llamada puede llegar recién cuando vuelve la conexión,
     *  minutos u horas después — sin esto, `hora_entrega` quedaría marcada al momento de la
     *  SINCRONIZACIÓN, no de la entrega, lo que es un dato de trazabilidad falso. Opcional: si no
     *  viene (el camino en línea de siempre), se usa `now()` como hasta ahora.
     */
    hora_entrega?: string;
    /** [Flujo único + OTP] Quién recibió la entrega — obligatorio, igual que en el flujo viejo que
     *  se retiró (RecepcionForm). Sin esto una foto sola no prueba QUIÉN aceptó la mercadería. */
    receptor?: string; rut?: string; observaciones?: string;
    /** Token HMAC ya verificado por PUT /api/recepcion-otp (mismo mecanismo que usaba el flujo
     *  viejo) — se re-valida acá server-side antes de aceptar la entrega, para que un cliente
     *  alterado no pueda saltarse la confirmación real de la tienda. */
    otpToken?: string; otpEmail?: string; otpCodigo?: string;
  };
  const sb = supabaseServer();

  // ── Reordenar paradas ──────────────────────────────────────────────────────
  if (body.ruta_id != null && Array.isArray(body.orden)) {
    if (!body.orden.length) return NextResponse.json({ error: 'orden vacío' }, { status: 400 });
    // Sin unique constraint en (ruta_id, store_cod) para un bulk-upsert simple; el volumen por
    // ruta es chico (pocas paradas), así que un update por fila es aceptable.
    for (let i = 0; i < body.orden.length; i++) {
      const { error: ordErr } = await sb.from('ruta_tiendas')
        .update({ orden: i + 1 })
        .eq('ruta_id', body.ruta_id)
        .eq('store_cod', body.orden[i]);
      if (ordErr) return NextResponse.json({ error: ordErr.message }, { status: 500 });
    }
    // La oficina se entera de que el chofer cambió el orden sugerido — no bloquea la respuesta.
    void sb.from('ruta_eventos').insert({ ruta_id: body.ruta_id, tipo: 'reorden', datos: { nuevo_orden: body.orden } });
    return NextResponse.json({ ok: true });
  }

  // ── Registrar entrega de UNA parada (fotos + hora real) ────────────────────
  if (body.ruta_tienda_id != null) {
    // [Flujo único + OTP] Este es ahora el ÚNICO camino por el que una entrega queda registrada
    // (se retiró "Entregar en Tienda") — así que absorbe sus dos garantías: quién recibió
    // (nombre+RUT, sin esto una foto sola no prueba nada) y que la tienda participó de verdad
    // (el código llegó a su correo, no algo que el chofer se pueda autoconfirmar). Se revalida el
    // token OTP server-side — no basta con que el cliente diga "ya lo verifiqué" — para que un
    // cliente alterado no pueda saltarse la confirmación real de la tienda.
    if (!body.receptor?.trim() || !body.rut?.trim())
      return NextResponse.json({ error: 'Falta el nombre y RUT de quien recibe' }, { status: 400 });
    if (!body.otpToken || !body.otpEmail || !body.otpCodigo || !verifyOtpToken(body.otpToken, body.otpEmail, body.otpCodigo))
      return NextResponse.json({ error: 'Código de verificación inválido o vencido — pide uno nuevo' }, { status: 403 });

    // Valida el override del cliente: si viene basura, se ignora silenciosamente y se usa la hora
    // del servidor — mejor una hora aproximada que una entrega que falla por un dato mal formado.
    const horaCliente  = body.hora_entrega ? new Date(body.hora_entrega) : null;
    const horaEntrega  = horaCliente && !Number.isNaN(horaCliente.getTime()) ? horaCliente.toISOString() : new Date().toISOString();
    const { data: rt, error: rtErr } = await sb.from('ruta_tiendas')
      .update({ estado_entrega: 'entregado', foto_urls: body.foto_urls ?? [], hora_entrega: horaEntrega })
      .eq('id', body.ruta_tienda_id)
      .select('id, ruta_id, store_cod')
      .single();
    if (rtErr) return NextResponse.json({ error: rtErr.message }, { status: 500 });
    // Evento con el detalle completo (fotos, temperatura si es congelado, receptor) —
    // `ruta_tiendas` guarda el estado ACTUAL para consultar rápido; `ruta_eventos` es el
    // historial de qué pasó y cuándo.
    void sb.from('ruta_eventos').insert({
      ruta_id: rt.ruta_id, tipo: 'entrega',
      datos: {
        store_cod: rt.store_cod, foto_urls: body.foto_urls ?? [], temperatura: body.temperatura ?? null,
        receptor: body.receptor, rut: body.rut, observaciones: body.observaciones ?? null,
      },
    });

    // [Flujo único] `trazabilidad_unidades` es el libro de custodia que usa el resto de la empresa
    // (Auditoría, Control Despacho) — antes SOLO lo escribía "Entregar en Tienda". Sin esto, una
    // entrega registrada acá quedaría invisible para todo lo que lee esa tabla. Se actualizan
    // TODAS las unidades EN_RUTA/CREADO de esa parada (pallets y bultos): acá la confirmación es
    // por PARADA completa, no por unidad escaneada una por una como en el flujo viejo.
    void sb.from('trazabilidad_unidades')
      .update({
        fecha_hora_real_llegada: horaEntrega,
        estado_actual:           'RECIBIDO_CONFORME',
        usuario_recepcion:       body.receptor,
        observaciones:           body.observaciones ?? null,
        links_evidencia:         body.foto_urls ?? [],
        ...(body.temperatura !== undefined ? { temperatura_llegada: body.temperatura } : {}),
      })
      .eq('ruta_id', rt.ruta_id)
      .eq('codigo_tienda', rt.store_cod)
      .in('estado_actual', ['EN_RUTA', 'CREADO']);

    return NextResponse.json({ data: rt, hora_entrega: horaEntrega });
  }

  // ── Estado de la ruta completa (comportamiento existente, sin cambios) ─────
  const VALID = ['pendiente', 'en_camino', 'entregado', 'recibido'];
  if (!body.id || !body.estado || !VALID.includes(body.estado))
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });

  // 1. Actualizar estado de la ruta
  const { error } = await sb.from('rutas_despacho').update({ estado: body.estado }).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 1b. Reflejar el estado por-tienda (columna que leen chofer / fiscalizador / conductor-hub).
  //     Antes quedaba congelada en 'pendiente' porque nadie la actualizaba tras crear la ruta.
  await sb.from('ruta_tiendas').update({ estado_entrega: body.estado }).eq('ruta_id', body.id);

  // 2. Sincronizar seguimiento en despacho_rm / despacho_regiones (fecha resuelta por tienda).
  const seguimiento = ESTADO_TO_SEGUIMIENTO[body.estado];
  if (seguimiento) {
    const { data: rt } = await sb.from('ruta_tiendas').select('store_cod').eq('ruta_id', body.id);
    const cods = (rt ?? []).map((r: { store_cod: string }) => r.store_cod);
    await syncSeguimientoDespacho(sb, cods, seguimiento);
  }

  return NextResponse.json({ ok: true });
}
