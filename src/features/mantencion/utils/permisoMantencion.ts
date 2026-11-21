// Quién puede qué en Mantención. Módulo puro.
//
// ── LA MISMA LISTA QUE `mant_ve_todo()` ───────────────────────────────────────────────────────
//
// La base decide qué filas ve cada uno desde el navegador con `mant_ve_todo()`
// (sql/2026-11-19_mantencion_fase1.sql), que deja ver todo a `admin` y `encargado-mantencion`.
// La API, que escribe con service role y se salta el RLS, tiene que aplicar exactamente la misma
// regla: si las dos listas se separan, alguien vería por la API lo que la base le niega, o al
// revés. Si se agrega un rol acá, se agrega allá.
//
// El rol sale de `app_metadata` (`permisoDe`), nunca de `user_metadata`: ver lib/permisoUsuario.ts.

import type { TipoComentario } from '../tipos';

export const ROLES_VE_TODO: readonly string[] = ['admin', 'encargado-mantencion'];

/** Ve todas las tiendas y clasifica. El resto ve solo las tiendas que tiene asignadas. */
export function veTodo(role: string | null | undefined): boolean {
  return !!role && ROLES_VE_TODO.includes(role);
}

/**
 * Qué comentarios puede escribir cada uno.
 *
 * La tienda solo RESPONDE: «lo que escribió la tienda no se borra; las aclaraciones se suman como
 * comentarios». Mantención pregunta y deja notas para el técnico.
 */
export function tiposDeComentario(role: string | null | undefined): TipoComentario[] {
  return veTodo(role) ? ['pregunta', 'nota_mantencion'] : ['respuesta'];
}
