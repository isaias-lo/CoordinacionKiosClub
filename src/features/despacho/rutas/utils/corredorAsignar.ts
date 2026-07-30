/**
 * Auto-asignación del CORREDOR / zona (`z:`) de una tienda a partir de sus COORDENADAS (GPS)
 * o su DIRECCIÓN (comuna) — lo que esté disponible (el GPS a veces llega días después).
 *
 * Todo se DERIVA del catálogo actual (no hay tablas que mantener a mano): los centroides por
 * zona y el mapa comuna→zona se calculan de las tiendas ya conocidas.
 *
 * Puro y testeable. NO toca el algoritmo de ruteo (`asignar`) — se usa para autocompletar la
 * zona y para agrupar/mostrar tiendas nuevas correctamente en el Enrutador.
 */

import { TIENDAS_INICIAL, GPS_INICIAL } from '../data/tiendas';

export type Coord = [number, number]; // [lat, lng]

/** Comuna = último segmento de la dirección ("Av X 123, Las Condes" → "LAS CONDES"). */
export function parseComuna(direccion?: string | null): string {
  if (!direccion) return '';
  const parts = String(direccion).split(',').map(s => s.trim()).filter(Boolean);
  return (parts[parts.length - 1] ?? '').toUpperCase();
}

/** Centroide (promedio de GPS) de cada zona, usando solo tiendas con zona y GPS conocidos. */
export function buildZonaCentroides(
  catalog: Record<string, { z?: string }>,
  gps: Record<string, Coord>,
): Record<string, Coord> {
  const acc: Record<string, { lat: number; lng: number; n: number }> = {};
  for (const [cod, info] of Object.entries(catalog)) {
    const zona = info.z;
    const g = gps[cod];
    if (!zona || !g) continue;
    (acc[zona] ??= { lat: 0, lng: 0, n: 0 });
    acc[zona].lat += g[0]; acc[zona].lng += g[1]; acc[zona].n += 1;
  }
  const out: Record<string, Coord> = {};
  for (const [zona, v] of Object.entries(acc)) out[zona] = [v.lat / v.n, v.lng / v.n];
  return out;
}

/** Mapa comuna → zona más frecuente entre las tiendas de esa comuna. */
export function buildComunaZonaMap(catalog: Record<string, { z?: string; d?: string }>): Record<string, string> {
  const counts: Record<string, Record<string, number>> = {};
  for (const info of Object.values(catalog)) {
    const zona = info.z;
    const comuna = parseComuna(info.d);
    if (!zona || !comuna) continue;
    (counts[comuna] ??= {});
    counts[comuna][zona] = (counts[comuna][zona] ?? 0) + 1;
  }
  const out: Record<string, string> = {};
  for (const [comuna, zonas] of Object.entries(counts)) {
    out[comuna] = Object.entries(zonas).sort((a, b) => b[1] - a[1])[0][0];
  }
  return out;
}

/** Distancia² (comparación relativa; suficiente para "el más cercano"). */
function dist2(a: Coord, b: Coord): number {
  const dLat = a[0] - b[0], dLng = a[1] - b[1];
  return dLat * dLat + dLng * dLng;
}

/**
 * Asigna el corredor/zona de una tienda:
 *   1) si trae GPS → la zona cuyo centroide está MÁS CERCA;
 *   2) si no, pero trae comuna conocida → la zona de esa comuna;
 *   3) si no hay ninguno → null (queda como "Centro"/sin corredor, comportamiento actual).
 */
export function corredorDeTienda(
  t: { lat?: number | null; lng?: number | null; comuna?: string | null; direccion?: string | null },
  centroides: Record<string, Coord>,
  comunaMap: Record<string, string>,
): string | null {
  if (t.lat != null && t.lng != null && Number.isFinite(t.lat) && Number.isFinite(t.lng)) {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [zona, c] of Object.entries(centroides)) {
      const d = dist2([t.lat, t.lng], c);
      if (d < bestD) { bestD = d; best = zona; }
    }
    if (best) return best;
  }
  const comuna = (t.comuna ? String(t.comuna) : parseComuna(t.direccion)).toUpperCase().trim();
  if (comuna && comunaMap[comuna]) return comunaMap[comuna];
  return null;
}

// ── Conveniencia: mapas derivados del catálogo estático (memoizados) ──────────────
let _centroides: Record<string, Coord> | null = null;
let _comunaMap: Record<string, string> | null = null;

/**
 * Auto-asigna el corredor usando los mapas del catálogo estático (centroides GPS + comuna→zona).
 * Para tests unitarios de la lógica, usar `corredorDeTienda` con mapas inyectados.
 */
export function corredorAuto(t: {
  lat?: number | null; lng?: number | null; comuna?: string | null; direccion?: string | null;
}): string | null {
  _centroides ??= buildZonaCentroides(TIENDAS_INICIAL, GPS_INICIAL);
  _comunaMap  ??= buildComunaZonaMap(TIENDAS_INICIAL);
  return corredorDeTienda(t, _centroides, _comunaMap);
}
