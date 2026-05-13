import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

const ALLOWED_TABLES = new Set(['despacho_rm', 'despacho_regiones', 'recepcion']);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get('table') ?? '';

  if (!ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: 'tabla no permitida' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data, error } = await sb
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
