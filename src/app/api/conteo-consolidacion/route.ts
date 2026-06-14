import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/apiAuth';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('conteo_consolidacion')
    .select('id, date, store_cod, zona, peso_kg, alto_cm, notas, estado, updated_at')
    .eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const body = await request.json() as {
    date: string; store_cod: string; zona: string;
    peso_kg?: number | null; alto_cm?: number | null;
    notas?: string | null; estado?: string;
  };
  const { data, error } = await supabaseServer()
    .from('conteo_consolidacion')
    .upsert(
      {
        date:       body.date,
        store_cod:  body.store_cod,
        zona:       body.zona,
        peso_kg:    body.peso_kg   ?? null,
        alto_cm:    body.alto_cm   ?? null,
        notas:      body.notas     ?? null,
        estado:     body.estado    ?? 'pendiente',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'date,store_cod' }
    )
    .select('id, date, store_cod, zona, peso_kg, alto_cm, notas, estado, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
