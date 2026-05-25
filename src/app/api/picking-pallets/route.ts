import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_pallets')
    .select('id, store_cod, state_key, picker_label, tipo, contenido, created_at')
    .eq('date', date)
    .order('created_at', { ascending: true })
    .order('id',          { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    date: string; store_cod: string; state_key: string; picker_label: string; tipo: string; contenido?: string;
  };
  const { data, error } = await supabaseServer()
    .from('picking_pallets')
    .insert({
      date:         body.date,
      store_cod:    body.store_cod,
      state_key:    body.state_key,
      picker_label: body.picker_label,
      tipo:         body.tipo,
      contenido:    body.contenido ?? 'hogar',
    })
    .select('id, store_cod, state_key, picker_label, tipo, contenido, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json() as { id: number; tipo: string };
  const { error } = await supabaseServer()
    .from('picking_pallets')
    .update({ tipo: body.tipo })
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json() as { id: number };
  const { error } = await supabaseServer()
    .from('picking_pallets')
    .delete()
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
