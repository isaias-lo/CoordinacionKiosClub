interface CalLike { on: boolean; p: number; b: number; ch?: number }
interface RutaLike { ts: { c: string }[] }

/**
 * Tiendas ARMADAS en el tablero (on + carga p/b/ch) que NO están en ninguna ruta calculada.
 *
 * Si se registra el despacho así, estas tiendas se pierden del registro **en silencio** (fue lo
 * que pasó con 02SCL/05LP/30PHU/56PZA el 04/08: tenían carga en Bodega pero no se rutearon a
 * ningún camión, así que `buildDespachoRMRecords` — que solo itera `rutas` — nunca las escribió).
 *
 * Devuelve los códigos (ordenados) para AVISAR al usuario antes/al registrar. Puro y testeable.
 */
export function tiendasArmadasSinRutear(
  calT: Record<string, CalLike>,
  rutas: RutaLike[],
): string[] {
  const ruteadas = new Set(rutas.flatMap(r => r.ts.map(t => t.c)));
  return Object.keys(calT)
    .filter(c => calT[c].on && (calT[c].p > 0 || calT[c].b > 0 || (calT[c].ch ?? 0) > 0))
    .filter(c => !ruteadas.has(c))
    .sort();
}
