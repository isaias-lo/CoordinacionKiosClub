// El interruptor "Asignación automática": quién puede cambiarlo y cómo se lee.
//
// Antes vivía en `localStorage`, así que cada navegador tenía el suyo. Eso rompía justo en el
// caso que importa: alguien lo apaga para armar el tablero a mano, otra persona abre el Enrutador
// en su equipo con el interruptor en ON, y el sistema le empieza a "adelantar" camiones sobre el
// armado del primero. Los dos creen estar viendo lo mismo y no.
//
// Ahora sale de `config_despacho.asignacion_automatica`, la misma tabla y el mismo endpoint que
// `odoo_activo` — global, sin fecha, y con Realtime, así que apagarlo se ve en los demás equipos
// en segundos.
//
// Puro y testeable: no toca red, ni base, ni localStorage.

/** Clave en `config_despacho`. Global (la tabla es clave/valor, sin fecha). */
export const CLAVE_AUTO = 'asignacion_automatica';

/**
 * Roles que pueden cambiarlo.
 *
 * `POST /api/parametros-sistema` ya exige admin — esta lista NO es la seguridad, es lo que decide
 * si el botón se ve apagado y con una explicación en vez de dejar que alguien lo apriete para
 * comerse un 403 sin entender por qué. El servidor sigue siendo la autoridad.
 */
const ROLES_QUE_CAMBIAN = new Set(['admin']);

/**
 * El valor del flag tal como viene del endpoint.
 *
 * Sin fila todavía ⇒ **ON**, que es el comportamiento de siempre: el día del deploy nada cambia
 * solo, y quien quiera apagarlo lo hace explícitamente. Solo el string 'false' apaga; cualquier
 * otra cosa (vacío, basura, la fila borrada) cae en ON, que es el lado seguro — como mucho el
 * sistema sigue ayudando, que es lo que hacía ayer.
 */
export function leerFlagAuto(params?: Record<string, string> | null): boolean {
  const v = params?.[CLAVE_AUTO];
  if (v == null) return true;
  return String(v).trim().toLowerCase() !== 'false';
}

/** El valor a guardar. La tabla es de strings, así que se normaliza en un solo lugar. */
export function escribirFlagAuto(activo: boolean): string {
  return activo ? 'true' : 'false';
}

/** ¿Este rol puede tocar el interruptor? */
export function puedeCambiarAuto(rol?: string | null): boolean {
  return ROLES_QUE_CAMBIAN.has(String(rol ?? '').trim().toLowerCase());
}

/**
 * Por qué el botón está deshabilitado, para el `title`.
 *
 * Un botón apagado sin explicación es peor que no tener botón: la persona no sabe si está roto,
 * si le falta permiso, o si el sistema se colgó.
 */
export function motivoBloqueoAuto(rol?: string | null): string | null {
  if (puedeCambiarAuto(rol)) return null;
  return 'Solo un administrador puede cambiar la asignación automática. Es un ajuste compartido: afecta a todos los que estén armando el tablero.';
}
