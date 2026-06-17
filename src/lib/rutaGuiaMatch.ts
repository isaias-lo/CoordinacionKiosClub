// Selección de la ruta a la que vincular una guía DTE subida en bodega.
//
// El Enrutador puede armar HOY una ruta que SALE MAÑANA, y la guía puede subirse
// el mismo día o al día siguiente. Por eso no exigimos fecha exacta: buscamos,
// dentro de una ventana corta de días, la ruta MÁS RECIENTE que contenga la
// tienda, prefiriendo rutas aún no finalizadas (no recibidas).

/** Rutas cuyo viaje ya se cerró: no deberían recibir guías nuevas si hay otra activa. */
export const ESTADOS_RUTA_FINALES = new Set(['recibido']);

export interface RutaCandidata {
  ruta_id: number;
  fecha: string;   // YYYY-MM-DD
  estado: string;
}

/**
 * Elige el `ruta_id` destino entre las rutas candidatas.
 * Prefiere rutas no finalizadas; desempata por fecha más reciente y luego id mayor
 * (ruta creada más tarde). Devuelve null si no hay candidatas.
 */
export function elegirRuta(candidatas: RutaCandidata[]): number | null {
  if (!candidatas.length) return null;
  const activas = candidatas.filter(c => !ESTADOS_RUTA_FINALES.has(c.estado));
  const pool = activas.length ? activas : candidatas;
  const mejor = [...pool].sort((a, b) =>
    a.fecha !== b.fecha ? b.fecha.localeCompare(a.fecha) : b.ruta_id - a.ruta_id,
  )[0];
  return mejor.ruta_id;
}
