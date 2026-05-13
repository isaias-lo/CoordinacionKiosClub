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

/* ── GET: list users ── */
export async function GET(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const sb = adminSb();
  const { data: { users }, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    users: users.map(u => ({
      id:           u.id,
      email:        u.email ?? '',
      full_name:    (u.user_metadata?.full_name as string) ?? u.email ?? '',
      role:         (u.user_metadata?.role     as string) ?? 'auditor',
      created_at:   u.created_at,
      last_sign_in: u.last_sign_in_at ?? null,
    })),
  });
}

/* ── POST: create user ── */
export async function POST(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { email, password, full_name, role } = await request.json() as {
    email: string; password: string; full_name: string; role: string;
  };
  if (!email || !password || !role)
    return NextResponse.json({ error: 'Email, contraseña y rol son requeridos' }, { status: 400 });

  const sb = adminSb();
  const { data: { user }, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || email, role },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    user: { id: user?.id, email: user?.email, full_name, role },
  });
}

/* ── PATCH: update role / full_name ── */
export async function PATCH(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { id, role, full_name, password } = await request.json() as {
    id: string; role?: string; full_name?: string; password?: string;
  };
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const sb = adminSb();
  const { data: { user: existing } } = await sb.auth.admin.getUserById(id);
  const meta: Record<string, unknown> = { ...(existing?.user_metadata ?? {}) };
  if (role)      meta.role      = role;
  if (full_name) meta.full_name = full_name;

  const updatePayload: Record<string, unknown> = { user_metadata: meta };
  if (password) updatePayload.password = password;

  const { error } = await sb.auth.admin.updateUserById(id, updatePayload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Keep profiles table in sync
  if (role || full_name) {
    const updateData: Record<string, string> = { id };
    if (role)      updateData.role      = role;
    if (full_name) updateData.full_name = full_name;

    const { error: profileErr } = await sb.from('profiles').update(updateData).eq('id', id);
    if (profileErr) {
      if (profileErr.code === 'PGRST116') {
        await sb.from('profiles').upsert(updateData);
      } else {
        console.error('[PATCH] profiles sync error:', profileErr.message);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

/* ── DELETE: remove user ── */
export async function DELETE(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });

  const { error } = await adminSb().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
