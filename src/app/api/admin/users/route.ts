import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/apiAuth';
import { parseBody, CreateUserSchema, UpdateUserSchema } from '@/lib/schemas';

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminSb() {
  return createClient(URL_, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* ── GET: list users (or, with ?count=pending, just the pending count) ── */
export async function GET(request: NextRequest) {
  if (!await verifyAdmin(request))
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const sb = adminSb();
  const { data: { users }, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lightweight mode for the approval badge: return only the count, not the full user list.
  // The Auth admin API has no metadata-role filter, so listUsers is still required, but this
  // trims the server→client payload to a single number (polled periodically by every admin tab).
  if (new URL(request.url).searchParams.get('count') === 'pending') {
    const pendingCount = users.filter(u => (u.user_metadata?.role as string) === 'pending').length;
    return NextResponse.json({ pendingCount });
  }

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

  const parsed = parseBody(CreateUserSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const { email, password, full_name, role } = parsed.data;

  const sb = adminSb();

  // Fetch role config so allowed_paths/home_path land in the JWT from day 1.
  // Only select columns guaranteed to exist — permissions column may not be present yet.
  const user_metadata: Record<string, unknown> = { full_name: full_name || email, role };
  const { data: roleData, error: roleErr } = await sb
    .from('roles')
    .select('allowed_paths,home_path')
    .eq('id', role)
    .single();

  if (!roleErr && roleData) {
    user_metadata.allowed_paths = Array.isArray(roleData.allowed_paths) ? roleData.allowed_paths : [];
    user_metadata.home_path     = roleData.home_path ?? '/perfil';
  }

  // Try to also fetch permissions (column may not exist yet — ignore error)
  const { data: permData } = await sb
    .from('roles')
    .select('permissions')
    .eq('id', role)
    .single();
  if (permData?.permissions) user_metadata.permissions = permData.permissions;

  const { data: { user }, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata,
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

  const parsed = parseBody(UpdateUserSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const { id, role, full_name, password } = parsed.data;

  const sb = adminSb();
  const { data: { user: existing } } = await sb.auth.admin.getUserById(id);
  const meta: Record<string, unknown> = { ...(existing?.user_metadata ?? {}) };
  if (role)      meta.role      = role;
  if (full_name) meta.full_name = full_name;

  if (role) {
    // Select only guaranteed columns to avoid silent query failure
    const { data: roleData, error: roleErr } = await sb
      .from('roles')
      .select('allowed_paths,home_path')
      .eq('id', role)
      .single();
    if (!roleErr && roleData) {
      meta.allowed_paths = Array.isArray(roleData.allowed_paths) ? roleData.allowed_paths : [];
      meta.home_path     = roleData.home_path ?? '/perfil';
    }
    // Permissions fetched separately — column may not exist yet
    const { data: permData } = await sb
      .from('roles')
      .select('permissions')
      .eq('id', role)
      .single();
    if (permData?.permissions) meta.permissions = permData.permissions;
  }

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
