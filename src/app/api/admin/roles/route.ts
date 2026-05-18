import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK   = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function adminSb() {
  return createClient(URL_, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const sb = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  return user?.user_metadata?.role === 'admin';
}

export async function GET(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const sb = adminSb();
  const { data, error } = await sb.from('roles').select('*').order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ roles: data });
}

export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { id, label, color, home_path, allowed_paths } = await request.json() as {
    id: string; label: string; color?: string; home_path?: string; allowed_paths?: string[];
  };
  if (!id || !label)
    return NextResponse.json({ error: 'ID y etiqueta son requeridos' }, { status: 400 });

  const sb = adminSb();
  const { data, error } = await sb.from('roles').insert({
    id,
    label,
    color:         color         ?? '#6B7280',
    home_path:     home_path     ?? '/perfil',
    allowed_paths: allowed_paths ?? [],
    is_system:     false,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ role: data });
}

export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await request.json() as {
    id: string; label?: string; color?: string; home_path?: string; allowed_paths?: string[];
  };
  if (!body.id)
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.label         !== undefined) updates.label         = body.label;
  if (body.color         !== undefined) updates.color         = body.color;
  if (body.home_path     !== undefined) updates.home_path     = body.home_path;
  if (body.allowed_paths !== undefined) updates.allowed_paths = body.allowed_paths;

  const sb = adminSb();
  const { error } = await sb.from('roles').update(updates).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const sb = adminSb();
  const { data: role } = await sb.from('roles').select('is_system').eq('id', id).single();
  if (role?.is_system)
    return NextResponse.json({ error: 'Los roles del sistema no se pueden eliminar' }, { status: 400 });

  const { error } = await sb.from('roles').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
