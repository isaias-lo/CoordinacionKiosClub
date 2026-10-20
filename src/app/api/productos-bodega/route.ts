import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth, verifyAdmin, verifyActor } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';
import { llavesDelProducto, normalizarCodigo, validarProducto } from '@/features/despacho/shared/productosBodega';

// Productos de Odoo guardados para pesar bultos (ver sql/2026-10-19_productos_bodega.sql).
// La tabla tiene RLS sin políticas: todo pasa por acá con service role. Leer, cualquier usuario
// con sesión (Bodega busca el producto escaneado); escribir y borrar, solo administradores
// (/admin/sistema).

const COLUMNAS = 'codigo, odoo_id, barcode, nombre, peso_kg, alto_cm, ancho_cm, largo_cm, updated_at';
// PostgREST corta en ~1000 filas: se pide por páginas hasta que una venga incompleta.
const PAGINA = 1000;
const MAX_PAGINAS = 20;

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const filas: unknown[] = [];
  for (let p = 0; p < MAX_PAGINAS; p++) {
    const { data, error } = await supabaseServer()
      .from('productos_bodega')
      .select(COLUMNAS)
      .order('nombre', { ascending: true })
      .range(p * PAGINA, (p + 1) * PAGINA - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    filas.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) break;
  }
  return NextResponse.json({ productos: filas });
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const v = validarProducto(await request.json().catch(() => null));
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const actor = await verifyActor(request);
  const { error } = await supabaseServer()
    .from('productos_bodega')
    .upsert({ ...v.fila, creado_por: actor?.name ?? null, updated_at: new Date().toISOString() }, { onConflict: 'codigo' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Las peticiones de Bodega por este producto quedan atendidas (ver ./peticiones/route.ts). El
  // producto ya está guardado: si esto falla no se deshace, pero se dice, para no dejarlas colgadas
  // sin que nadie se entere.
  const ahora = new Date().toISOString();
  const { data: atendidas, error: errPet } = await supabaseServer()
    .from('productos_peticiones')
    .update({ estado: 'agregado', resuelto_por: actor?.name ?? null, resuelto_at: ahora, updated_at: ahora })
    .eq('estado', 'pendiente')
    .in('llave', llavesDelProducto(v.fila))
    .select('id');
  if (errPet) return NextResponse.json({ ok: true, avisoPeticiones: errPet.message });
  return NextResponse.json({ ok: true, peticionesAtendidas: atendidas?.length ?? 0 });
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const codigo = normalizarCodigo(request.nextUrl.searchParams.get('codigo') ?? '');
  if (!codigo) return NextResponse.json({ error: 'Falta el código' }, { status: 400 });
  const { error } = await supabaseServer().from('productos_bodega').delete().eq('codigo', codigo);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
