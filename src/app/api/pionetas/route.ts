import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

function syncPersonalSheets() {
  const base = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  fetch(`${base}/api/personal/export-sheets`, { method: 'POST' })
    .catch(e => console.error('[pionetas] sync-sheets:', e));
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data, error } = await supabaseServer()
    .from('pionetas')
    .select('id, nombre, telefono, empresa')
    .eq('activo', true)
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// [Permiso 2026-09-08] POST/PATCH/DELETE eran admin-only desde un endurecimiento de seguridad
// masivo (6b80ad1) que no distinguió este catálogo de otros endpoints más sensibles — mantener
// nombres/teléfonos de pionetas al día es trabajo normal de quien coordina despacho, no solo de
// admin, y `/api/control-flota` (que sí reasigna pionetas EN una ruta activa) ya solo pedía
// `verifyAuth`. Bajado a `verifyAuth` para que cualquier usuario logueado pueda gestionar el
// catálogo desde FLOTA → Personal, igual que ya podía hacerlo con las rutas.
export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as { nombre?: string; telefono?: string; empresa?: string };
  if (!body.nombre?.trim())
    return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('pionetas')
    .insert({ nombre: body.nombre.trim(), telefono: body.telefono ?? null, empresa: body.empresa ?? null })
    .select('id, nombre, telefono, empresa')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPersonalSheets();
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as { id?: string; nombre?: string; telefono?: string; empresa?: string };
  if (!body.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const upd: Record<string, unknown> = {};
  if (body.nombre   !== undefined) upd.nombre   = body.nombre.trim();
  if (body.telefono !== undefined) upd.telefono = body.telefono || null;
  if (body.empresa  !== undefined) upd.empresa  = body.empresa  || null;

  if (!Object.keys(upd).length)
    return NextResponse.json({ error: 'sin campos a actualizar' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('pionetas')
    .update(upd)
    .eq('id', body.id)
    .select('id, nombre, telefono, empresa')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPersonalSheets();
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await supabaseServer()
    .from('pionetas')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPersonalSheets();
  return NextResponse.json({ ok: true });
}
