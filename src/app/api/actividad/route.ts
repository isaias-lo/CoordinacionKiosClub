import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth, verifyActor } from '@/lib/apiAuth';
import { ACCIONES_ACTIVIDAD } from '@/lib/actividad';
import { ACCIONES_DIAGNOSTICO } from '@/features/despacho/actividad/utils/feedActividad';
import { fechaChile } from '@/lib/fechaChile';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });
const FUENTES  = new Set(['nacional', 'rmcosta']);
// La misma lista que el tipo `AccionActividad`: no pueden desalinearse.
const ACCIONES = new Set<string>(ACCIONES_ACTIVIDAD);

// Registra una acción de bodega. El actor (id + nombre) sale del token verificado, NO del
// cliente → no se puede falsear quién hizo qué.
export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return UNAUTH();

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }

  const fuente  = String(body.fuente ?? '');
  const accion  = String(body.accion ?? '');
  const mensaje = String(body.mensaje ?? '').trim();
  if (!FUENTES.has(fuente) || !ACCIONES.has(accion) || !mensaje) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha)
    ? body.fecha
    : fechaChile();

  const { error } = await supabaseServer().from('actividad_bodega').insert({
    fecha,
    actor_id:      actor.id,
    actor_name:    actor.name,
    fuente,
    accion,
    tienda_cod:    body.tienda_cod    ? String(body.tienda_cod)    : null,
    tienda_nombre: body.tienda_nombre ? String(body.tienda_nombre) : null,
    mensaje:       mensaje.slice(0, 300),
    detalle:       body.detalle ?? null,
  });
  if (error) {
    console.error('[actividad POST]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Feed de actividad, más reciente primero. Filtros opcionales: fecha, fuente, actor_id, tienda_cod.
//
// EL DIAGNÓSTICO NO VIENE SALVO QUE SE PIDA (`?diagnostico=1`).
//
// El feed responde "quién hizo qué", y `merge_descarte` no lo hizo nadie: es el sistema contándose
// a sí mismo (ver el comentario de `ACCIONES_ACTIVIDAD`). El 29/09 era el 68% de lo que llegaba a
// la pantalla, y con el cupo gastado en eso los 200 eventos solo alcanzaban hasta las 14:10 — los
// 472 de la mañana quedaban afuera SIN AVISO.
//
// Por eso el filtro es del SERVIDOR y no del cliente: filtrar después de traer gastaría el cupo
// igual. Y por eso se devuelve `total`: una lista que termina sola se lee como "no hubo más", y
// esa afirmación tiene que poder desmentirse en pantalla.
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const sp = request.nextUrl.searchParams;
  const fecha     = sp.get('fecha');
  const fuente    = sp.get('fuente');
  const actorId   = sp.get('actor_id');
  const tiendaCod = sp.get('tienda_cod');
  const verDiag   = sp.get('diagnostico') === '1';
  const limit = Math.min(1000, Math.max(1, Number(sp.get('limit') ?? 200)));

  // `count: 'exact'` cuenta las filas que PASAN los filtros, no las devueltas: es lo que permite
  // saber cuántas quedaron fuera del `limit`.
  let q = supabaseServer()
    .from('actividad_bodega')
    .select(
      'id, created_at, fecha, actor_id, actor_name, fuente, accion, tienda_cod, tienda_nombre, mensaje, detalle',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fecha)     q = q.eq('fecha', fecha);
  if (fuente)    q = q.eq('fuente', fuente);
  if (actorId)   q = q.eq('actor_id', actorId);
  if (tiendaCod) q = q.eq('tienda_cod', tiendaCod);
  if (!verDiag && ACCIONES_DIAGNOSTICO.length) {
    q = q.not('accion', 'in', `(${ACCIONES_DIAGNOSTICO.join(',')})`);
  }

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, total: count ?? null, limit });
}
