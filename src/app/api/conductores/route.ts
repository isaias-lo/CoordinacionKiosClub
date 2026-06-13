import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth, verifyAdmin } from '@/lib/apiAuth';
import { parseBody, CreateConductorSchema, UpdateConductorSchema } from '@/lib/schemas';

function syncPersonalSheets() {
  const base = process.env.NEXTAUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  fetch(`${base}/api/personal/export-sheets`, { method: 'POST' })
    .catch(e => console.error('[conductores] sync-sheets:', e));
}

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { data, error } = await supabaseServer()
    .from('conductores')
    .select('id, nombre, telefono, empresa')
    .eq('activo', true)
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ conductores: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const parsed = parseBody(CreateConductorSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const { data, error } = await supabaseServer()
    .from('conductores')
    .insert({ nombre: body.nombre.trim(), telefono: body.telefono ?? null, empresa: body.empresa ?? null })
    .select('id, nombre, telefono, empresa')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPersonalSheets();
  return NextResponse.json({ conductor: data });
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const parsed = parseBody(UpdateConductorSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const upd: Record<string, unknown> = {};
  if (body.nombre   !== undefined) upd.nombre   = body.nombre!.trim();
  if (body.telefono !== undefined) upd.telefono = body.telefono || null;
  if (body.empresa  !== undefined) upd.empresa  = body.empresa  || null;

  if (!Object.keys(upd).length)
    return NextResponse.json({ error: 'sin campos a actualizar' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('conductores')
    .update(upd)
    .eq('id', body.id)
    .select('id, nombre, telefono, empresa')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPersonalSheets();
  return NextResponse.json({ conductor: data });
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await supabaseServer()
    .from('conductores')
    .update({ activo: false })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  syncPersonalSheets();
  return NextResponse.json({ ok: true });
}
