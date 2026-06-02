import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import type { TrazabilidadUnidad } from '@/lib/trazabilidad.types';

// Columnas en el mismo orden que TRAZABILIDAD_ABASTECIMIENTO_PROD
const HEADERS = [
  'ID_Unidad_Logistica', 'Codigo_QR', 'URL_QR', 'Numero_Guia',
  'Tipo_Unidad', 'Origen', 'Codigo_Tienda', 'Tienda_Destino',
  'Tipo_Tienda_Cache', 'Comuna_Destino', 'Region_Destino', 'Direccion_Tienda',
  'Transportista', 'Tipo_Carga', 'Regimen',
  'Peso_Kg', 'Alto_cm', 'Ancho_cm', 'Largo_cm', 'Volumen_m3',
  'Fecha_Hora_Creacion', 'Fecha_Hora_Despacho', 'Fecha_Tentativa_Llegada',
  'Ventana_Horaria_Recepcion', 'Fecha_Hora_Real_Llegada',
  'Indicador_Llegada_Tiempo', 'Minutos_Desfase',
  'Temperatura_Salida', 'Temperatura_Llegada', 'Alerta_Temperatura',
  'Estado_Actual', 'Usuario_Creador', 'Usuario_Despacho', 'Usuario_Recepcion',
  'Fecha_Hora_Ultima_Actualizacion', 'Tipo_Incidencia', 'Descripcion_Incidencia',
  'Link_Evidencia_Fotografica', 'Estado_Resolucion_Incidencia',
  'Observaciones', 'Origen_Carga_Manual_o_Masiva', 'Reintentos_Recepcion',
  'Fecha_Cierre', 'Usuario_Cierre',
];

function toRow(u: TrazabilidadUnidad): string[] {
  return [
    u.id_unidad_logistica,
    u.codigo_qr ?? '',
    u.url_qr ?? '',
    u.numero_guia ?? '',
    u.tipo_unidad,
    u.origen ?? '',
    u.codigo_tienda ?? '',
    u.tienda_destino ?? '',
    u.tipo_tienda ?? '',
    u.comuna_destino ?? '',
    u.region_destino ?? '',
    u.direccion_tienda ?? '',
    u.transportista ?? '',
    u.tipo_carga ?? '',
    u.regimen ?? '',
    u.peso_kg?.toString() ?? '',
    u.alto_cm?.toString() ?? '',
    u.ancho_cm?.toString() ?? '',
    u.largo_cm?.toString() ?? '',
    u.volumen_m3?.toString() ?? '',
    u.fecha_hora_creacion,
    u.fecha_hora_despacho ?? '',
    u.fecha_tentativa_llegada ?? '',
    u.ventana_horaria_recepcion ?? '',
    u.fecha_hora_real_llegada ?? '',
    u.indicador_llegada_tiempo ?? '',
    u.minutos_desfase?.toString() ?? '',
    u.temperatura_salida?.toString() ?? '',
    u.temperatura_llegada?.toString() ?? '',
    u.alerta_temperatura ?? '',
    u.estado_actual,
    u.usuario_creador ?? '',
    u.usuario_despacho ?? '',
    u.usuario_recepcion ?? '',
    u.updated_at,
    u.tipo_incidencia ?? '',
    u.descripcion_incidencia ?? '',
    (u.links_evidencia ?? []).join(' | '),
    u.estado_resolucion ?? '',
    u.observaciones ?? '',
    u.origen_carga,
    u.reintentos_recepcion.toString(),
    u.fecha_cierre ?? '',
    u.usuario_cierre ?? '',
  ];
}

function escapeCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

// GET /api/trazabilidad/export?fecha=2026-06-01&estado=RECIBIDO_INCIDENCIA
export async function GET(req: NextRequest) {
  const sb     = supabaseServer();
  const params = req.nextUrl.searchParams;

  let query = sb
    .from('trazabilidad_unidades')
    .select('*')
    .order('fecha_hora_creacion', { ascending: false })
    .limit(5000);

  if (params.get('fecha')) {
    const fecha = params.get('fecha')!;
    query = query
      .gte('fecha_hora_creacion', `${fecha}T00:00:00.000Z`)
      .lt('fecha_hora_creacion',  `${fecha}T23:59:59.999Z`);
  }
  if (params.get('estado'))  query = query.eq('estado_actual', params.get('estado')!);
  if (params.get('tienda'))  query = query.eq('codigo_tienda', params.get('tienda')!);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data as TrazabilidadUnidad[]).map(u =>
    toRow(u).map(escapeCsv).join(',')
  );

  const csv = [HEADERS.join(','), ...rows].join('\n');
  const filename = `trazabilidad_${params.get('fecha') ?? 'completo'}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
