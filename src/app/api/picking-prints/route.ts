import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_prints')
    .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name, batch, print_count')
    .eq('date', date);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const body = await request.json() as { stateKey: string; pickerLabel: string; pallets: number; date: string; tipo?: string; printedByName?: string; batch?: string };
  // RPC atómico: inserta (print_count=1) o incrementa print_count en reimpresión, y guarda el batch.
  const { error } = await supabaseServer().rpc('fn_record_picking_print', {
    p_state_key:       body.stateKey,
    p_date:            body.date,
    p_picker_label:    body.pickerLabel,
    p_pallets:         body.pallets,
    p_tipo:            body.tipo ?? 'P',
    p_printed_by_name: body.printedByName ?? null,
    p_batch:           body.batch ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
