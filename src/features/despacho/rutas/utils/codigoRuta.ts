/* ── Código de ruta del manifiesto ────────────────────────────────────────────
   RUTA-DDMMYY-NN, donde NN es un consecutivo (1-based, 2 dígitos). El `i` que se pasa
   es el índice GLOBAL de la ruta en el día (no la posición dentro del lote impreso), para
   que al cerrar camiones uno a uno cada manifiesto tome el siguiente número (-01, -02, …)
   en vez de repetir -01. Puro y testeable. */

export function codigoRuta(fecha: string, i: number): string {
  const [y, m, d] = fecha.split('-');
  return `RUTA-${d}${m}${y.slice(2)}-${String(i + 1).padStart(2, '0')}`;
}

/**
 * El siguiente código libre del día: uno más que el MAYOR ya usado, no «cuántos hay».
 *
 * Desde que un camión se puede reabrir (16/11/2026) los manifiestos del día dejan huecos, y contar
 * deja de servir: con -01, -02 y -03 guardados, reabrir el -01 y volver a cerrarlo daba -03 por
 * conteo, que ya es de otro camión. Se usa cuando el código pedido ya lo tiene otra patente.
 */
export function siguienteCodigoLibre(fecha: string, usados: (string | null | undefined)[]): string {
  const prefijo = codigoRuta(fecha, 0).slice(0, -2); // 'RUTA-DDMMYY-'
  let mayor = 0;
  for (const u of usados) {
    if (!u || !u.startsWith(prefijo)) continue;
    const n = Number(u.slice(prefijo.length));
    if (Number.isInteger(n) && n > mayor) mayor = n;
  }
  return codigoRuta(fecha, mayor);
}
