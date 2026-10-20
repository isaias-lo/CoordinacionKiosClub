import { NextRequest, NextResponse } from 'next/server';
import { verifyAdmin, verifyActor } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { validarPeticion } from '@/features/despacho/shared/productosBodega';

// Peticiones de productos que Bodega escaneó y no estaban (ver sql/2026-10-20_productos_peticiones.sql).
// RLS sin políticas: todo pasa por acá con service role. Pedir, cualquier usuario con sesión (el
// nombre sale de la sesión, no del cuerpo); ver y descartar, solo administradores (/admin/sistema).
// Marcarlas como agregadas lo hace `POST /api/productos-bodega` al guardar el producto.

const COLUMNAS = 'id, codigo, pedido_por, ultimo_pedido_por, veces, created_at, updated_at';
const TOPE = 200;

export async function GET(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const { data, error } = await supabaseServer()
    .from('productos_peticiones')
    .select(COLUMNAS)
    .eq('estado', 'pendiente')
    .order('updated_at', { ascending: false })
    .limit(TOPE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ peticiones: data ?? [] });
}

export async function POST(request: NextRequest) {
  const actor = await verifyActor(request);
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const v = validarPeticion(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const sb = supabaseServer();

  // Ya pedido por alguien y todavía pendiente: se suma a esa, no se abre otra.
  const sumarse = async (): Promise<NextResponse | null> => {
    const { data: previa, error } = await sb.from('productos_peticiones')
      .select('id, veces, pedido_por').eq('estado', 'pendiente').eq('llave', v.llave).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!previa) return null;
    const { error: e2 } = await sb.from('productos_peticiones')
      .update({ veces: previa.veces + 1, ultimo_pedido_por: actor.name, updated_at: new Date().toISOString() })
      .eq('id', previa.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    return NextResponse.json({ ok: true, yaPedido: true, pedidoPor: previa.pedido_por });
  };

  const ya = await sumarse();
  if (ya) return ya;
  const { error } = await sb.from('productos_peticiones').insert({
    codigo: v.codigo, llave: v.llave, pedido_por: actor.name, pedido_por_id: actor.id,
  });
  if (error) {
    // Dos equipos pidieron el mismo código al mismo tiempo: el índice único dejó entrar a uno.
    if (error.code === '23505') return (await sumarse()) ?? NextResponse.json({ ok: true, yaPedido: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, yaPedido: false });
}

/** Descartar una petición (no es un producto, o no se va a agregar). Solo administradores. */
export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const cuerpo = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = typeof cuerpo?.id === 'number' && Number.isInteger(cuerpo.id) ? cuerpo.id : null;
  if (id == null) return NextResponse.json({ error: 'Falta la petición' }, { status: 400 });
  const actor = await verifyActor(request);
  const ahora = new Date().toISOString();
  const { error } = await supabaseServer().from('productos_peticiones')
    .update({ estado: 'descartado', resuelto_por: actor?.name ?? null, resuelto_at: ahora, updated_at: ahora })
    .eq('id', id).eq('estado', 'pendiente');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
