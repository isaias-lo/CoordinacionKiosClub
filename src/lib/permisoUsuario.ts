/**
 * El permiso de una persona —su rol, las rutas que abre, su inicio y los permisos por sección—
 * se lee de `app_metadata`, NUNCA de `user_metadata`.
 *
 * La diferencia es quién puede escribir cada uno:
 *
 *   · `user_metadata` lo escribe EL PROPIO USUARIO desde el navegador, con la clave pública:
 *     `supabase.auth.updateUser({ data: { ... } })`. La app lo usa así para el nombre
 *     (`perfil/page.tsx`). Con el rol ahí, cualquiera con sesión podía abrir la consola, mandarse
 *     `{ role: 'admin' }`, recargar, y el middleware, el panel de usuarios y las APIs de admin lo
 *     trataban como admin. Nada lo registraba.
 *   · `app_metadata` solo lo escribe el servidor con service role. El token lo trae igual —es otro
 *     claim del mismo JWT—, así que leerlo no cuesta nada más.
 *
 * Por eso `user_metadata` queda solo para lo que es del usuario: el nombre. Las copias viejas de
 * `role`/`allowed_paths` que todavía tiene NO se leen en ningún lado, y no deben volver a leerse.
 *
 * Validar los tipos acá no es de más: `app_metadata` lo escribe el servidor, pero lo escribió
 * también la copia inicial (sql/2026-11-20_rol_en_app_metadata.sql), y un `allowed_paths` que no
 * es arreglo le rompe `isPathAllowed` a quien lo lea.
 */

export type NivelPermiso = 'edit' | 'read';

export interface Permiso {
  role?: string;
  allowed_paths?: string[];
  home_path?: string;
  permissions?: Record<string, NivelPermiso>;
}

/** Lo mínimo de un usuario de Supabase (User, la sesión de la cookie o el payload del JWT). */
export type ConAppMetadata = { app_metadata?: unknown } | null | undefined;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Lo que dice `app_metadata`, con cada campo validado. Lo que falta o viene mal, no está. */
export function permisoDe(usuario: ConAppMetadata): Permiso {
  const meta = usuario?.app_metadata;
  if (!esObjeto(meta)) return {};
  const out: Permiso = {};
  if (typeof meta.role === 'string' && meta.role.trim()) out.role = meta.role;
  if (Array.isArray(meta.allowed_paths)) {
    out.allowed_paths = meta.allowed_paths.filter((p): p is string => typeof p === 'string');
  }
  if (typeof meta.home_path === 'string' && meta.home_path) out.home_path = meta.home_path;
  if (esObjeto(meta.permissions)) {
    const perms: Record<string, NivelPermiso> = {};
    for (const [seccion, nivel] of Object.entries(meta.permissions)) {
      if (nivel === 'edit' || nivel === 'read') perms[seccion] = nivel;
    }
    out.permissions = perms;
  }
  return out;
}

export const CLAVES_PERMISO = ['role', 'allowed_paths', 'home_path', 'permissions'] as const;

/**
 * Lo que se manda a `updateUserById({ app_metadata })` para REEMPLAZAR el permiso entero.
 *
 * Supabase mezcla `app_metadata` clave por clave: una clave que no se manda queda como estaba, y
 * solo `null` la borra. Así que las cuatro claves van siempre, en `null` las que el permiso nuevo
 * no trae. Las demás claves (`provider`, `providers`) no se tocan.
 */
export function reemplazoDePermiso(nuevo: Permiso): Record<(typeof CLAVES_PERMISO)[number], unknown> {
  return {
    role:          nuevo.role          ?? null,
    allowed_paths: nuevo.allowed_paths ?? null,
    home_path:     nuevo.home_path     ?? null,
    permissions:   nuevo.permissions   ?? null,
  };
}

/** La fila de `roles` tal como la devuelve Supabase (los campos pueden faltar). */
export interface FilaRol {
  allowed_paths?: unknown;
  home_path?: unknown;
  permissions?: unknown;
}

/**
 * Lo que se estampa en `app_metadata` al darle un rol a alguien. Sin fila (el rol no está en la
 * tabla) va solo el rol, y manda el respaldo de `SYSTEM_ROLE_PATHS` — como hasta hoy.
 */
export function permisoParaRol(role: string, fila?: FilaRol | null): Permiso {
  const out: Permiso = { role };
  if (!fila) return out;
  out.allowed_paths = Array.isArray(fila.allowed_paths)
    ? fila.allowed_paths.filter((p): p is string => typeof p === 'string')
    : [];
  out.home_path = typeof fila.home_path === 'string' && fila.home_path ? fila.home_path : '/perfil';
  if (esObjeto(fila.permissions)) out.permissions = permisoDe({ app_metadata: { permissions: fila.permissions } }).permissions;
  return out;
}
