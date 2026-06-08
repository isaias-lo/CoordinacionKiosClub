import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TIPO = 'odoo-progress';

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date') ?? todayISO();
  const { data, error } = await supabaseServer()
    .from('picking_session_state')
    .select('state_key, picker_label')
    .eq('date', date)
    .eq('tipo', TIPO);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const result: Record<string, { total: number; done: number; status: string }> = {};
  for (const row of data ?? []) {
    try {
      const parsed = JSON.parse(row.picker_label) as { total: number; done: number };
      const status = parsed.total === 0 ? 'none' : parsed.done === parsed.total ? 'complete' : 'partial';
      result[row.state_key] = { ...parsed, status };
    } catch { /* skip malformed */ }
  }
  return NextResponse.json({ stores: result });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as {
    stores: Array<{ cod: string; total: number; done: number }>;
  };
  const date = todayISO();
  if (!body.stores?.length) return NextResponse.json({ ok: true });

  const rows = body.stores.map(s => ({
    state_key: s.cod,
    date,
    picker_label: JSON.stringify({ total: s.total, done: s.done }),
    tipo: TIPO,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseServer()
    .from('picking_session_state')
    .upsert(rows, { onConflict: 'state_key,date' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
