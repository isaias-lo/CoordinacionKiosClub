/**
 * Cuenta TIENDAS distintas (por `cod`) en cada estado de seguimiento — NO líneas de pallet/bulto.
 *
 * En Despacho RM/Regiones cada fila es una línea (un pallet o bulto), y una tienda recibida marca
 * todas sus líneas. Contar filas inflaba el semáforo (p.ej. "9 Recibido" eran 2 tiendas con 9
 * líneas). Aquí se cuentan cods distintos por estado + el total de tiendas. Puro y testeable.
 */
export function contarTiendasPorEstado(
  rows: { cod?: unknown; seguimiento?: unknown }[],
  estados: string[],
): { counts: Record<string, number>; total: number } {
  const counts: Record<string, number> = {};
  for (const k of estados) {
    counts[k] = new Set(
      rows.filter(r => String(r.seguimiento ?? '') === k).map(r => String(r.cod ?? '')),
    ).size;
  }
  const total = new Set(rows.map(r => String(r.cod ?? ''))).size;
  return { counts, total };
}
