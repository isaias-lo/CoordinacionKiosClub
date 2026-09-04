import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyAdmin } from '@/lib/apiAuth';
import { parseBody, CreateRoleSchema, UpdateRoleSchema } from '@/lib/schemas';

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminSb() {
  return createClient(URL_, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
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

  const parsed = parseBody(CreateRoleSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const { id, label, color, home_path, allowed_paths } = parsed.data;

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

  const parsed = parseBody(UpdateRoleSchema, await request.json());
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const updates: Record<string, unknown> = {};
  if (body.label         !== undefined) updates.label         = body.label;
  if (body.color         !== undefined) updates.color         = body.color;
  if (body.home_path     !== undefined) updates.home_path     = body.home_path;
  if (body.allowed_paths !== undefined) updates.allowed_paths = body.allowed_paths;
  if (body.permissions   !== undefined) updates.permissions   = body.permissions;

  const sb = adminSb();
  const { error } = await sb.from('roles').update(updates).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // [P9] PROPAGAR el cambio a quienes YA tienen el rol.
  //
  // El permiso efectivo de cada persona no se lee de la tabla `roles`: se guarda como una COPIA en
  // su `user_metadata` (y de ahí lo toma el JWT que lee AuthProvider). Esa copia se estampaba solo
  // al crear el usuario o al cambiarle el rol, así que editar el rol actualizaba la tabla pero
  // dejaba a todos sus usuarios con el permiso VIEJO — el síntoma reportado: "cambié el rol y no
  // ven lo que les di acceso". Acá se re-estampa a cada uno.
  let actualizados = 0;
  const fallidos: string[] = [];
  if (updates.allowed_paths !== undefined || updates.home_path !== undefined || updates.permissions !== undefined) {
    try {
      // Config vigente del rol (lo recién guardado + lo que no se tocó).
      const { data: rol } = await sb
        .from('roles').select('allowed_paths,home_path,permissions').eq('id', body.id).single();

      const conElRol: { id: string; meta: Record<string, unknown> }[] = [];
      // listUsers pagina; se recorre hasta agotar (no hay filtro por metadata en la API admin).
      for (let page = 1; page <= 20; page++) {
        const { data, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr || !data?.users?.length) break;
        for (const u of data.users) {
          if ((u.user_metadata?.role as string) === body.id) {
            conElRol.push({ id: u.id, meta: { ...(u.user_metadata ?? {}) } });
          }
        }
        if (data.users.length < 200) break;
      }

      for (const u of conElRol) {
        const meta = { ...u.meta };
        if (updates.allowed_paths !== undefined)
          meta.allowed_paths = Array.isArray(rol?.allowed_paths) ? rol.allowed_paths : [];
        if (updates.home_path !== undefined) meta.home_path = rol?.home_path ?? '/perfil';
        if (updates.permissions !== undefined && rol?.permissions !== undefined)
          meta.permissions = rol.permissions;
        const { error: upErr } = await sb.auth.admin.updateUserById(u.id, { user_metadata: meta });
        if (upErr) { fallidos.push(u.id); console.error('[roles PATCH] re-estampar', u.id, upErr.message); }
        else actualizados++;
      }
    } catch (e) {
      console.error('[roles PATCH] propagación', e);
    }
  }

  // `actualizados` permite avisar en el panel a cuánta gente alcanzó el cambio. Ojo: la sesión ya
  // abierta sigue con el JWT viejo hasta que se refresque (el cliente lo hace al volver el foco).
  return NextResponse.json({ ok: true, actualizados, fallidos: fallidos.length });
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
