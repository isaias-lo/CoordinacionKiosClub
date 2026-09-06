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

/**
 * Tipos que NO se abastecen por calendario.
 *
 * `oficina` es la central (recados internos). `punto` son los puntos logísticos que el
 * coordinador carga a propósito para poder rutearlos desde el Planificador cuando hay que
 * agendar un retiro o una entrega: el proveedor de cajas del CD, un proveedor que no entrega
 * congelados, el distribuidor que lleva los congelados a Regiones Norte y Sur.
 *
 * No son tiendas: nadie les programa carga y nunca van a estar en el calendario. Distinguirlos
 * es lo que permite que el chequeo de coherencia no los denuncie todos los días — y un aviso
 * que sale todos los días deja de leerse.
 */
export const TIPOS_SIN_ABASTECIMIENTO = new Set(['oficina', 'punto']);

/**
 * ¿A esta tienda se le programa carga por calendario?
 *
 * Se pregunta por `tipo` y NO por código: así, si mañana agregan otro punto de retiro, basta
 * marcarlo en Config y ningún chequeo hay que tocar.
 *
 * Es distinto de `fluyeSinCalendario`: esa dice quién ENTRA al Enrutador sin estar en el
 * calendario (solo la oficina). Un punto logístico no se abastece, pero tampoco tiene por qué
 * aparecer en el pool del día.
 */
export function seAbastecePorCalendario(tipo?: string | null): boolean {
  return !TIPOS_SIN_ABASTECIMIENTO.has(String(tipo ?? '').trim().toLowerCase());
}
