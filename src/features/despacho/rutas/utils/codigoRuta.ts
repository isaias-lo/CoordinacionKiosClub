/* ── Código de ruta del manifiesto ────────────────────────────────────────────
   RUTA-DDMMYY-NN, donde NN es un consecutivo (1-based, 2 dígitos). El `i` que se pasa
   es el índice GLOBAL de la ruta en el día (no la posición dentro del lote impreso), para
   que al cerrar camiones uno a uno cada manifiesto tome el siguiente número (-01, -02, …)
   en vez de repetir -01. Puro y testeable. */

export function codigoRuta(fecha: string, i: number): string {
  const [y, m, d] = fecha.split('-');
  return `RUTA-${d}${m}${y.slice(2)}-${String(i + 1).padStart(2, '0')}`;
}
