import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth, verifyActor } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });
const FUENTES  = new Set(['nacional', 'rmcosta']);
const ACCIONES = new Set(['registrar_item', 'editar_item', 'eliminar_item', 'unificar', 'sumar', 'registrar_dia']);

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
    : new Date().toISOString().slice(0, 10);

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
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const sp = request.nextUrl.searchParams;
  const fecha     = sp.get('fecha');
  const fuente    = sp.get('fuente');
  const actorId   = sp.get('actor_id');
  const tiendaCod = sp.get('tienda_cod');
  const limit = Math.min(500, Math.max(1, Number(sp.get('limit') ?? 200)));

  let q = supabaseServer()
    .from('actividad_bodega')
    .select('id, created_at, fecha, actor_id, actor_name, fuente, accion, tienda_cod, tienda_nombre, mensaje, detalle')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fecha)     q = q.eq('fecha', fecha);
  if (fuente)    q = q.eq('fuente', fuente);
  if (actorId)   q = q.eq('actor_id', actorId);
  if (tiendaCod) q = q.eq('tienda_cod', tiendaCod);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
