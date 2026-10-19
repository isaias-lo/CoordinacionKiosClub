/**
 * Reintento de un alta de Bodega con el MISMO `client_op_id`.
 *
 * Con mal wifi el INSERT puede llegar y perderse la respuesta. Antes la pantalla decía «sin
 * conexión», la persona tocaba otra vez y quedaba una unidad de más con el número siguiente. Ahora
 * el alta lleva un id y se reintenta sola con ese mismo id: si la primera sí llegó, el servidor
 * devuelve la que ya existe (ver sql/2026-10-19_idempotencia_bodega_e_impresiones.sql).
 *
 * El id NO se recuerda entre llamadas a propósito: un toque nuevo puede ser una unidad nueva de
 * verdad (agregar dos chocolates seguidos), y reusar el id las juntaría en una.
 */

/** Se reintenta sin red o con el servidor caído. Un 4xx es una respuesta: no se repite. */
export function valeReintentar(status: number | null): boolean {
  return status === null || status >= 500;
}

export const ESPERAS_ALTA_MS = [800, 2000];

/**
 * Llama a `intento` hasta que dé una respuesta que no valga reintentar, o se acaben las esperas.
 * `intento` devuelve el status HTTP, o null si no hubo respuesta. Devuelve el último resultado.
 */
export async function conReintentos<T extends { status: number | null }>(
  intento: () => Promise<T>,
  esperas: number[] = ESPERAS_ALTA_MS,
  dormir: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<T> {
  let r = await intento();
  for (const ms of esperas) {
    if (!valeReintentar(r.status)) return r;
    await dormir(ms);
    r = await intento();
  }
  return r;
}
