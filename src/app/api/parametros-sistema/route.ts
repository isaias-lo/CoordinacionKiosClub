import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data, error } = await supabaseServer()
    .from('config_despacho')
    .select('clave, valor, descripcion');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Return as flat object { clave: valor }
  const params: Record<string, string> = {};
  (data ?? []).forEach(row => { params[row.clave as string] = row.valor as string; });
  return NextResponse.json({ data: params });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { clave: string; valor: string };
  const { error } = await supabaseServer()
    .from('config_despacho')
    .upsert({ clave: body.clave, valor: body.valor, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
