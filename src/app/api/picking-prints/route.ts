import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_prints')
    .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name')
    .eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const body = await request.json() as { stateKey: string; pickerLabel: string; pallets: number; date: string; tipo?: string; printedByName?: string };
  const { error } = await supabaseServer()
    .from('picking_prints')
    .upsert(
      {
        state_key:        body.stateKey,
        date:             body.date,
        picker_label:     body.pickerLabel,
        pallets:          body.pallets,
        tipo:             body.tipo ?? 'P',
        printed_at:       new Date().toISOString(),
        printed_by_name:  body.printedByName ?? null,
      },
      { onConflict: 'state_key,date' }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
