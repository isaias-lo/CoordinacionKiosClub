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
