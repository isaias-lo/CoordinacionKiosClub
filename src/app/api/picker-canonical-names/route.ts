import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const { data, error } = await supabaseServer()
    .from('picker_canonical_names')
    .select('key, display_name')
    .order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { key: string; display_name: string };
  if (!body.display_name?.trim()) {
    const { error } = await supabaseServer()
      .from('picker_canonical_names')
      .delete()
      .eq('key', body.key);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const { data, error } = await supabaseServer()
    .from('picker_canonical_names')
    .upsert({ key: body.key, display_name: body.display_name.trim() }, { onConflict: 'key' })
    .select('key, display_name')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
