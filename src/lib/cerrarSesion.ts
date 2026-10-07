import { supabase } from '@/lib/supabase';
import { resumenOffline } from '@/lib/offline/resumen';

/**
 * Cerrar sesión de verdad, para que en el mismo equipo pueda entrar otra cuenta.
 *
 * Antes cada botón hacía `await supabase.auth.signOut(); router.push('/login')`, y eso fallaba de
 * tres maneras, todas peores en la app instalada en el teléfono:
 *
 *  1. `signOut()` llama a Supabase por la red. Si esa llamada falla (señal mala, un 5xx), la
 *     librería DEVUELVE el error sin borrar la sesión local (auth-js `_signOut`: solo ignora 401,
 *     403 y 404). Nadie miraba el error, así que se navegaba a /login con la cookie de la cuenta A
 *     intacta, el middleware veía una sesión válida y mandaba de vuelta al inicio de A. Desde
 *     afuera: "cierro sesión y no me deja entrar con otra cuenta" hasta borrar cookies a mano.
 *  2. `router.push` es navegación del lado del cliente: el JavaScript de la cuenta A sigue vivo.
 *     El caché de React Query, los contextos que cargaron una vez al montar y el caché del router
 *     de Next siguen con los datos y permisos de A cuando B entra.
 *  3. Sin señal, `signOut()` podía quedarse esperando y el botón parecía no hacer nada.
 *
 * Así que acá: se intenta avisar al servidor con un tope de tiempo, se borran las cookies de
 * sesión pase lo que pase, y se sale con una navegación completa para empezar de cero.
 */

/** Cuánto se espera a que Supabase confirme el cierre antes de seguir sin él. */
const TOPE_MS = 4000;

/**
 * Nombres de las cookies de sesión de Supabase en un `document.cookie`.
 *
 * `@supabase/ssr` guarda la sesión en `sb-<proyecto>-auth-token` y, si no cabe, la parte en
 * `.0`, `.1`… Se borran todas las que empiecen con `sb-` para no dejar un pedazo suelto que
 * después se lea como una sesión rota. Puro y testeable.
 */
export function cookiesDeSesion(cookie: string): string[] {
  return cookie
    .split(';')
    .map(par => par.split('=')[0]?.trim() ?? '')
    .filter(nombre => nombre.startsWith('sb-'));
}

export function borrarCookiesDeSesion(): void {
  for (const nombre of cookiesDeSesion(document.cookie)) {
    // Mismo path con el que las escribe @supabase/ssr (DEFAULT_COOKIE_OPTIONS.path = '/').
    document.cookie = `${nombre}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
  // Por si quedó algo de una versión que guardaba la sesión en localStorage.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const clave = localStorage.key(i);
      if (clave?.startsWith('sb-')) localStorage.removeItem(clave);
    }
  } catch { /* almacenamiento bloqueado: no hay nada que borrar */ }
}

/**
 * Pregunta antes de cerrar si quedó trabajo sin enviar en este equipo.
 *
 * La cola NO se borra: es trabajo hecho y se manda la próxima vez que alguien abra la app con
 * señal en este equipo. Pero quien cierra sesión tiene que saberlo, sobre todo si después no va a
 * volver a abrirla.
 */
async function confirmarSiHayPendientes(): Promise<boolean> {
  let pendientes = 0;
  try {
    ({ pendientes } = await resumenOffline());
  } catch { /* si no se puede leer la cola, no se bloquea el cierre */ }
  if (pendientes === 0) return true;
  const texto = pendientes === 1 ? 'Queda 1 registro sin enviar' : `Quedan ${pendientes} registros sin enviar`;
  return window.confirm(
    `${texto} en este equipo. No se pierde: se va a enviar la próxima vez que alguien abra la app aquí con señal.\n\n¿Cerrar sesión igual?`,
  );
}

/**
 * Cierra la sesión de este equipo y deja la app en /login, limpia.
 *
 * Usa `scope: 'local'`: cierra la sesión de ESTE equipo y no la del teléfono de la misma persona.
 * El `'global'` de antes sacaba a la persona de todos sus equipos cada vez que alguien cerraba en
 * una tablet compartida.
 *
 * @returns `false` si la persona decidió no cerrar.
 */
export async function cerrarSesion(): Promise<boolean> {
  if (!(await confirmarSiHayPendientes())) return false;

  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      new Promise(resolve => setTimeout(resolve, TOPE_MS)),
    ]);
  } catch { /* la cookie se borra igual abajo */ }

  borrarCookiesDeSesion();
  try { sessionStorage.removeItem('pendingEmail'); } catch { /* nada */ }

  // Navegación completa, no `router.push`: descarta todo el estado en memoria de la cuenta que se
  // fue. `replace` para que "atrás" no vuelva a una pantalla de esa cuenta.
  window.location.replace('/login');
  return true;
}
