import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

// Feed de auditoría de altas/bajas de pallets del día (para el Monitoreo de Picking).
export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const date = request.nextUrl.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer()
    .from('picking_eventos')
    .select('id, date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, created_at')
    .eq('date', date)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
