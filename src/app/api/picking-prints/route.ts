import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_prints')
    .select('state_key, printed_at, picker_label, pallets')
    .eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { stateKey: string; pickerLabel: string; pallets: number; date: string };
  const { error } = await supabaseServer()
    .from('picking_prints')
    .upsert(
      {
        state_key:    body.stateKey,
        date:         body.date,
        picker_label: body.pickerLabel,
        pallets:      body.pallets,
        printed_at:   new Date().toISOString(),
      },
      { onConflict: 'state_key,date' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
