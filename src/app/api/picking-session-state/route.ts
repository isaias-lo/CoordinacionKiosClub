import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_session_state')
    .select('state_key, picker_label, tipo')
    .eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    state_key: string; date: string; picker_label: string; tipo: string;
  };
  const { data, error } = await supabaseServer()
    .from('picking_session_state')
    .upsert({
      state_key:    body.state_key,
      date:         body.date,
      picker_label: body.picker_label,
      tipo:         body.tipo,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'state_key,date' })
    .select('state_key, picker_label, tipo')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
