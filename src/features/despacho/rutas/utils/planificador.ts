/* ── Planificador de rutas (tab MAPA) ─────────────────────────────────────────
   Helpers PUROS del planificador visual: búsqueda de tiendas, "paradas virtuales"
   para reusar dibMapa/nn, y deep-link a Google Maps para el conductor. Sin DOM ni red. */

export interface TiendaOpcion { cod: string; nombre: string; comuna: string }

/**
 * Tiendas candidatas para el buscador: SOLO las que tienen coordenadas (`gps`), filtradas por
 * código / nombre / comuna. Orden por código; `limite` acota la lista.
 */
export function buscarTiendas(
  catalogo: Record<string, { n?: string; z?: string }>,
  gps: Record<string, number[]>,
  query: string,
  limite = 40,
): TiendaOpcion[] {
  const q = query.trim().toLowerCase();
  const out: TiendaOpcion[] = [];
  for (const cod of Object.keys(gps)) {
    const inf = catalogo[cod];
    const nombre = inf?.n ?? '';
    const comuna = inf?.z ?? '';
    if (q && !`${cod} ${nombre} ${comuna}`.toLowerCase().includes(q)) continue;
    out.push({ cod, nombre, comuna });
  }
  out.sort((a, b) => a.cod.localeCompare(b.cod));
  return out.slice(0, limite);
}

/** Paradas "virtuales" (sin carga) para reusar dibMapa/nn, que trabajan con {c,p,b}. */
export function virtualStops(cods: string[]): { c: string; p: number; b: number }[] {
  return cods.map(c => ({ c, p: 0, b: 0 }));
}

/**
 * Deep link a Google Maps con la ruta (para que el conductor navegue): origin = partida,
 * destination = última parada, waypoints = intermedias en orden. Ignora cods sin coordenadas.
 */
export function googleMapsDeepLink(
  start: { lat: number; lng: number },
  orderedCods: string[],
  gps: Record<string, number[]>,
): string {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving';
  const origin = `&origin=${start.lat},${start.lng}`;
  const stops = orderedCods.map(c => gps[c]).filter(Boolean) as number[][];
  if (stops.length === 0) return base + origin;
  const coord = (c: number[]) => `${c[0]},${c[1]}`;
  const dest = `&destination=${coord(stops[stops.length - 1])}`;
  const mids = stops.slice(0, -1);
  const wp = mids.length ? `&waypoints=${encodeURIComponent(mids.map(coord).join('|'))}` : '';
  return base + origin + dest + wp;
}
