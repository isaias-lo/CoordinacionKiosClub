import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/apiAuth';
import { parseBody, CreateUserSchema, UpdateUserSchema } from '@/lib/schemas';
import { permisoDe, permisoParaRol, reemplazoDePermiso, type FilaRol } from '@/lib/permisoUsuario';

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
    const pendingCount = users.filter(u => permisoDe(u).role === 'pending').length;
    return NextResponse.json({ pendingCount });
  }

  return NextResponse.json({
    users: users.map(u => ({
      id:           u.id,
      email:        u.email ?? '',
      full_name:    (u.user_metadata?.full_name as string) ?? u.email ?? '',
      role:         permisoDe(u).role ?? 'auditor',
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

  // El permiso va en `app_metadata` (solo lo escribe el servidor) y desde el primer token. En
  // `user_metadata` va solo el nombre: ese lo puede reescribir el propio usuario desde el navegador.
  const { data: { user }, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || email },
    app_metadata:  await permisoDelRol(sb, role),
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

  const updatePayload: Record<string, unknown> = {};
  if (full_name) updatePayload.user_metadata = { ...(existing?.user_metadata ?? {}), full_name };
  // El rol va a `app_metadata`. Supabase MEZCLA `app_metadata` clave por clave: omitir una no la
  // borra, solo mandarla en `null`. Por eso van las cuatro siempre —en null las que el rol nuevo
  // no trae—, o quedarían, por ejemplo, los `permissions` del rol anterior con el rol nuevo.
  // Lo que ya había (`provider`, `providers`) va igual: así queda bien aunque la API reemplazara
  // en vez de mezclar.
  if (role) {
    updatePayload.app_metadata = {
      ...(existing?.app_metadata ?? {}),
      ...reemplazoDePermiso(await permisoDelRol(sb, role)),
    };
  }
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

/**
 * El permiso que se estampa al darle `role` a alguien, leído de la tabla `roles`.
 *
 * `permissions` se pide aparte, como antes: hubo un tiempo en que la columna no existía, y pedirla
 * junto con las otras hacía fallar la consulta entera — el usuario quedaba sin rutas en el token.
 */
async function permisoDelRol(sb: ReturnType<typeof adminSb>, role: string) {
  const { data: fila, error } = await sb
    .from('roles').select('allowed_paths,home_path').eq('id', role).single();
  if (error || !fila) return permisoParaRol(role, null);
  const { data: perm } = await sb.from('roles').select('permissions').eq('id', role).single();
  return permisoParaRol(role, { ...fila, permissions: perm?.permissions } as FilaRol);
}
