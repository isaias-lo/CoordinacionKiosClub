// ¿Esta pestaña está corriendo una versión vieja del sistema? Puro y testeable.
//
// Existe por los encargados manuales de Congelados del 2026-09-11: el arreglo que hace que nazcan
// con Caja Cartón (y no con un Pallet) entró a producción a las 11:58, y a las 12:54 un equipo
// seguía creando encargados con Pallet. Nada obliga a recargar — una pestaña abierta desde la
// mañana sigue con el código de la mañana todo el día —, así que un arreglo publicado a mediodía
// puede no llegar a quien lo necesita hasta el día siguiente, y el bug "arreglado" sigue pasando.

/** Cuando no hay commit (desarrollo local, build sin Git) no hay nada que comparar. */
export const VERSION_DESCONOCIDA = 'dev';

/**
 * `local` = el commit con el que se compiló el código que está corriendo esta pestaña.
 * `remota` = el commit que responde el servidor ahora mismo (la versión publicada).
 *
 * Distintos ⇒ hay versión nueva. Si falta alguna, o alguna es de desarrollo, no se avisa: más vale
 * no avisar nunca que mandar a recargar a alguien a mitad de una carga sin motivo.
 */
export function hayVersionNueva(local: string | undefined | null, remota: string | undefined | null): boolean {
  if (!local || !remota) return false;
  if (local === VERSION_DESCONOCIDA || remota === VERSION_DESCONOCIDA) return false;
  return local !== remota;
}

/** Cuánto se pospone el aviso al cerrarlo. No es "nunca más": vuelve. */
export const POSPONER_MS = 30 * 60_000;

/**
 * ¿Se muestra el aviso ahora?
 *
 * La X lo POSPONE, no lo silencia. Antes lo cerraba para toda la sesión, y esa diferencia importa
 * según qué se publicó: para un cambio de color da igual, pero para el arreglo que evita que se
 * borren los pallets entre compañeros significaba quedarse con el código viejo el resto del día
 * —perdiendo trabajo— sin volver a enterarse.
 *
 * Quien está cargando un camión lo saca de encima y sigue; quien lo olvidó, se entera igual.
 */
export function debeMostrarAviso(hayNueva: boolean, pospuestoHasta: number, ahora: number): boolean {
  return hayNueva && ahora >= pospuestoHasta;
}

// ── POR QUÉ EL AVISO MUESTRA LAS DOS VERSIONES ────────────────────────────────────────────────
//
// 06/10/2026: el coordinador apretó Recargar y el aviso siguió ahí. Revisé la cadena entera y
// está bien construida —el service worker atiende `SKIP_WAITING`, las navegaciones van a la red,
// y las dos versiones salen del mismo `VERCEL_GIT_COMMIT_SHA`—, pero NO pude medirlo contra
// producción. Afirmar una causa sin verla sería adivinar.
//
// Así que el aviso pasa a decir cuál tiene cargada la pestaña y cuál está publicada. Con eso la
// próxima vez la respuesta se lee en pantalla, sin consola y sin que nadie tenga que reproducirlo:
//
//   · dos distintas, y tras recargar siguen las MISMAS → la recarga no está trayendo el código
//     nuevo, y el problema es de caché o de despliegue.
//   · dos distintas, y tras recargar son OTRAS → hubo un despliegue más. No es un bug.
//   · IGUALES → el aviso lo levantó el service worker, no la comparación de versiones: el
//     navegador ya descargó algo y quedó esperando. Ahí el botón no tiene versión nueva que traer.

/** Los primeros 7 del commit, que es como se nombra un commit en todos lados. */
export function versionCorta(v: string | null | undefined): string {
  const s = String(v ?? '').trim();
  return s ? s.slice(0, 7) : '—';
}

/**
 * La línea que el aviso muestra debajo del texto. PURA.
 *
 * Sin la versión publicada todavía (el service worker avisó antes de que contestara `/api/version`)
 * devuelve `null` y no se dibuja: media verdad no ayuda a diagnosticar nada.
 */
export function resumenDeVersiones(
  local: string | null | undefined,
  remota: string | null | undefined,
): string | null {
  if (!local || !remota) return null;
  if (local === remota) return `misma versión (${versionCorta(local)}) · la descargó el navegador`;
  return `tienes ${versionCorta(local)} · publicada ${versionCorta(remota)}`;
}

// ── CUANDO EL SERVICE WORKER AVISA PERO NO HAY NADA NUEVO ─────────────────────────────────────
//
// El aviso tiene DOS fuentes: comparar versiones contra `/api/version`, y el service worker, que
// avisa con que haya una versión descargada ESPERANDO. La segunda no compara nada.
//
// 12/10/2026, en el Mac del coordinador: el aviso no se iba ni recargando ni cerrando sesión, y en
// los demás equipos no pasaba. La línea de diagnóstico del #687 lo dijo solo:
//
//     misma versión (731b3f1) · la descargó el navegador
//
// Las dos versiones IGUALES. O sea que no había ninguna versión nueva que traer: en esa máquina
// quedó un worker trabado en `waiting`, y como el aviso se levanta por su sola presencia, volvía
// a aparecer después de cada recarga. El botón no podía sacarlo porque no había nada que buscar.
//
// La regla: con la misma versión no se avisa. Se le cede el paso al worker en silencio, para que
// deje de estar esperando, y no se molesta a nadie con una recarga que no trae nada.

/** Qué hacer cuando el service worker dice que tiene una versión esperando. */
export type AccionWorkerEsperando = 'avisar' | 'activar-en-silencio';

/**
 * `publicada` es lo que respondió `/api/version`, o `null` si no se pudo preguntar. PURA.
 *
 * Sin respuesta se AVISA, como hasta ahora: el service worker ya descargó algo, y perder un aviso
 * real porque el servidor no contestó es peor que mostrar uno de más. La regla nueva solo aplica
 * cuando hay una respuesta y dice que es la misma versión.
 */
export function queHacerConElWorkerEsperando(
  local: string | null | undefined,
  publicada: string | null | undefined,
): AccionWorkerEsperando {
  if (!publicada) return 'avisar';
  return hayVersionNueva(local, publicada) ? 'avisar' : 'activar-en-silencio';
}
