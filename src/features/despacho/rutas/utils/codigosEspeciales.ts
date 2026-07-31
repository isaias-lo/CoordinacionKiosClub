/**
 * Códigos/tiendas que fluyen al Enrutador SIN estar en el calendario del día.
 *
 * Regla del sistema: "el calendario manda" — una tienda normal solo aparece si está en el
 * calendario. La EXCEPCIÓN es la Oficina Kios Club: no es una tienda de despacho sino la oficina
 * central (recados internos), así que nunca está en el calendario, pero SÍ debe fluir cuando se
 * arma en Bodega.
 *
 * Forma ROBUSTA de identificarla: por el `tipo` de la tienda en el catálogo (columna `tiendas.tipo`
 * = 'oficina'). Así, si algún día le cambian el CÓDIGO desde Config, el `tipo` se mantiene y la
 * oficina sigue fluyendo sin calendario. El set de códigos fijo queda como respaldo/compatibilidad.
 */
export const TIPO_SIN_CALENDARIO = 'oficina';

/** Respaldo por código (compat / catálogo estático) cuando el `tipo` no viene marcado. */
export const CODIGOS_SIN_CALENDARIO = new Set<string>(['OFIKC']);

/**
 * ¿Esta tienda puede fluir sin estar en el calendario?
 * Prioriza el `tipo` del catálogo (robusto ante cambio de código); si no, cae al set de códigos.
 */
export function fluyeSinCalendario(cod: string, tipo?: string | null): boolean {
  return (tipo ?? '').toLowerCase() === TIPO_SIN_CALENDARIO || CODIGOS_SIN_CALENDARIO.has(cod);
}
