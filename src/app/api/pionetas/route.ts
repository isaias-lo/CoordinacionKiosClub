import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data, error } = await supabaseServer()
    .from('pionetas')
    .select('id, nombre, telefono, empresa')
    .eq('activo', true)
    .order('nombre');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { nombre?: string; telefono?: string; empresa?: string };
  if (!body.nombre?.trim())
    return NextResponse.json({ error: 'nombre requerido' }, { status: 400 });

  const { data, error } = await supabaseServer()
    .from('pionetas')
    .insert({ nombre: body.nombre.trim(), telefono: body.telefono ?? null, empresa: body.empresa ?? null })
    .select('id, nombre, telefono, empresa')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await supabaseServer()
    .from('pionetas')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
