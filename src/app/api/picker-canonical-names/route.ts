import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { verifyAuth } from '@/lib/apiAuth';

const UNAUTH = () => NextResponse.json({ error: 'No autorizado' }, { status: 401 });

export async function GET(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const { data, error } = await supabaseServer()
    .from('picker_canonical_names')
    .select('key, display_name, updated_by_name, updated_at')
    .order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAuth(request)) return UNAUTH();
  const body = await request.json() as { key: string; display_name: string; updated_by_name?: string };
  const sb = supabaseServer();

  const newName = body.display_name?.trim() ?? '';
  const byName  = body.updated_by_name?.trim() ?? '';

  if (!newName) {
    const { error } = await sb.from('picker_canonical_names').delete().eq('key', body.key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await sb
      .from('picker_canonical_names')
      .upsert({ key: body.key, display_name: newName, updated_by_name: byName, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit logging handled atomically by Postgres trigger trg_picker_name_change
  return NextResponse.json({ ok: true });
}
