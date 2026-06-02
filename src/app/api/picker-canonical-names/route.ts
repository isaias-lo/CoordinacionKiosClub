import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data, error } = await supabaseServer()
    .from('picker_canonical_names')
    .select('key, display_name, updated_by_name, updated_at')
    .order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { key: string; display_name: string; updated_by_name?: string };
  const sb = supabaseServer();

  // Fetch old name for audit trail
  const { data: existing } = await sb
    .from('picker_canonical_names')
    .select('display_name')
    .eq('key', body.key)
    .maybeSingle();
  const oldName = (existing as { display_name?: string } | null)?.display_name ?? '';
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

  // Log change if name actually changed
  if (oldName !== newName) {
    await sb.from('picker_name_changes').insert({
      picker_key: body.key, old_name: oldName, new_name: newName,
      changed_by_name: byName, changed_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}
