import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import type {
  TrazabilidadCreatePayload,
  TrazabilidadDespachoPayload,
  TrazabilidadRecepcionPayload,
  TrazabilidadCierrePayload,
} from '@/lib/trazabilidad.types';

const TABLE = 'trazabilidad_unidades';

// ── GET — consultar unidades ──────────────────────────────────────────
// ?ruta_id=123
// ?codigo_tienda=PQA
// ?estado=RECIBIDO_INCIDENCIA
// ?fecha=2026-06-01   (por fecha_hora_creacion)
// ?id=abc123          (una unidad específica)
export async function GET(req: NextRequest) {
  const sb     = supabaseServer();
  const params = req.nextUrl.searchParams;

  let query = sb.from(TABLE).select('*').order('fecha_hora_creacion', { ascending: false });

  if (params.get('id'))             query = query.eq('id_unidad_logistica', params.get('id')!);
  if (params.get('ruta_id'))        query = query.eq('ruta_id', params.get('ruta_id')!);
  if (params.get('codigo_tienda'))  query = query.eq('codigo_tienda', params.get('codigo_tienda')!);
  if (params.get('estado'))         query = query.eq('estado_actual', params.get('estado')!);
  if (params.get('transportista'))  query = query.eq('transportista', params.get('transportista')!);

  if (params.get('fecha')) {
    const fecha = params.get('fecha')!;
    query = query
      .gte('fecha_hora_creacion', `${fecha}T00:00:00.000Z`)
      .lt('fecha_hora_creacion',  `${fecha}T23:59:59.999Z`);
  }

  const limit = parseInt(params.get('limit') ?? '200', 10);
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// ── POST — crear unidad (PUNTO 1: Creación) ───────────────────────────
export async function POST(req: NextRequest) {
  const sb = supabaseServer();
  const body = await req.json() as TrazabilidadCreatePayload | TrazabilidadCreatePayload[];

  const units = Array.isArray(body) ? body : [body];

  // Enriquecer con datos de tiendas si faltan campos de caché
  const codigosNecesarios = [...new Set(units.map(u => u.codigo_tienda).filter(Boolean))];

  let tiendaMap: Record<string, {
    nombre: string; tipo: string; sector_comuna: string; region: string;
    direccion: string; ventana: string;
  }> = {};

  if (codigosNecesarios.length > 0) {
    const { data: tiendas } = await sb
      .from('tiendas')
      .select('codigo, nombre, tipo, sector_comuna, region, direccion, ventana')
      .in('codigo', codigosNecesarios);

    tiendaMap = Object.fromEntries((tiendas ?? []).map(t => [t.codigo, t]));
  }

  const rows = units.map(u => {
    const t = tiendaMap[u.codigo_tienda] ?? {};
    return {
      id_unidad_logistica:       u.id_unidad_logistica,
      codigo_qr:                 u.codigo_qr ?? null,
      url_qr:                    u.codigo_qr
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/r/${u.codigo_qr}`
        : null,
      numero_guia:               u.numero_guia ?? null,
      tipo_unidad:               u.tipo_unidad,
      origen:                    u.origen ?? null,
      codigo_tienda:             u.codigo_tienda,
      tienda_destino:            u.tienda_destino  || t.nombre  || null,
      tipo_tienda:               u.tipo_tienda     || t.tipo    || null,
      comuna_destino:            u.comuna_destino  || t.sector_comuna || null,
      region_destino:            u.region_destino  || t.region  || null,
      direccion_tienda:          u.direccion_tienda || t.direccion || null,
      transportista:             u.transportista ?? null,
      tipo_carga:                u.tipo_carga ?? null,
      regimen:                   u.regimen ?? null,
      peso_kg:                   u.peso_kg ?? null,
      alto_cm:                   u.alto_cm ?? null,
      ancho_cm:                  u.ancho_cm ?? null,
      largo_cm:                  u.largo_cm ?? null,
      fecha_tentativa_llegada:   u.fecha_tentativa_llegada ?? null,
      ventana_horaria_recepcion: u.ventana_horaria_recepcion || t.ventana || null,
      usuario_creador:           u.usuario_creador ?? null,
      ruta_id:                   u.ruta_id ?? null,
      origen_carga:              u.origen_carga ?? 'manual',
      estado_actual:             'CREADO',
    };
  });

  const { data, error } = await sb.from(TABLE).upsert(rows, {
    onConflict: 'id_unidad_logistica',
    ignoreDuplicates: false,
  }).select();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

// ── PATCH — actualizar unidades según punto del ciclo ─────────────────
// body.punto: 'despacho' | 'recepcion' | 'cierre'
export async function PATCH(req: NextRequest) {
  const sb   = supabaseServer();
  const body = await req.json() as
    | ({ punto: 'despacho'  } & TrazabilidadDespachoPayload)
    | ({ punto: 'recepcion' } & TrazabilidadRecepcionPayload)
    | ({ punto: 'cierre'    } & TrazabilidadCierrePayload);

  // ── PUNTO 2: Despacho ─────────────────────────────────────────────
  if (body.punto === 'despacho') {
    const { ids, temperatura_salida, usuario_despacho } = body;
    if (!ids?.length) return NextResponse.json({ error: 'ids requerido' }, { status: 400 });

    const update: Record<string, unknown> = {
      fecha_hora_despacho: new Date().toISOString(),
      estado_actual:       'EN_RUTA',
    };
    if (temperatura_salida !== undefined) update.temperatura_salida = temperatura_salida;
    if (usuario_despacho)                update.usuario_despacho    = usuario_despacho;

    const { data, error } = await sb
      .from(TABLE)
      .update(update)
      .in('id_unidad_logistica', ids)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // ── PUNTO 3: Recepción ────────────────────────────────────────────
  if (body.punto === 'recepcion') {
    const {
      id_unidad_logistica, fecha_hora_real_llegada,
      temperatura_llegada, estado_actual, tipo_incidencia,
      descripcion_incidencia, links_evidencia, observaciones,
      usuario_recepcion, recepcion_id,
    } = body;

    if (!id_unidad_logistica) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

    const update: Record<string, unknown> = {
      fecha_hora_real_llegada,
      estado_actual,
    };
    if (temperatura_llegada !== undefined)  update.temperatura_llegada    = temperatura_llegada;
    if (tipo_incidencia)                    update.tipo_incidencia         = tipo_incidencia;
    if (descripcion_incidencia)             update.descripcion_incidencia  = descripcion_incidencia;
    if (links_evidencia?.length)            update.links_evidencia         = links_evidencia;
    if (observaciones)                      update.observaciones           = observaciones;
    if (usuario_recepcion)                  update.usuario_recepcion       = usuario_recepcion;
    if (recepcion_id)                       update.recepcion_id            = recepcion_id;

    // Si hay incidencia, marcar como PENDIENTE de resolución
    if (estado_actual === 'RECIBIDO_INCIDENCIA') {
      update.estado_resolucion = 'PENDIENTE';
    }

    const { data, error } = await sb
      .from(TABLE)
      .update(update)
      .eq('id_unidad_logistica', id_unidad_logistica)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // ── PUNTO 4: Cierre de incidencia ─────────────────────────────────
  if (body.punto === 'cierre') {
    const { id_unidad_logistica, estado_resolucion, observaciones, usuario_cierre } = body;
    if (!id_unidad_logistica) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

    const update: Record<string, unknown> = {
      estado_resolucion,
      fecha_cierre:   new Date().toISOString(),
      estado_actual:  'CERRADO',
    };
    if (observaciones)  update.observaciones  = observaciones;
    if (usuario_cierre) update.usuario_cierre = usuario_cierre;

    const { data, error } = await sb
      .from(TABLE)
      .update(update)
      .eq('id_unidad_logistica', id_unidad_logistica)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  return NextResponse.json({ error: 'punto inválido' }, { status: 400 });
}
