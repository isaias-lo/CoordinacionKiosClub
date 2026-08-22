/* ── Planificador de rutas (tab MAPA) ─────────────────────────────────────────
   Helpers PUROS del planificador visual: búsqueda de tiendas, "paradas virtuales"
   para reusar dibMapa/nn, y deep-link a Google Maps para el conductor. Sin DOM ni red. */

import { dkm } from './helpers';
import { nn } from './routing';

export interface TiendaOpcion { cod: string; nombre: string; comuna: string }

/* ── Paradas por DIRECCIÓN (no-tienda) ─────────────────────────────────────────
   Direcciones libres agregadas como paradas del plan. Se modelan como stops con id
   propio (prefijo DIR-) + coords geocodificadas; el ruteo/mapa ya resuelve por gps[cod],
   así que basta inyectar sus coords en `gps` y su nombre en `tiendas`. */

export interface ParadaDireccion { id: string; label: string; gps: number[] }

const DIR_PREFIX = 'DIR-';

/** ¿El código corresponde a una parada por dirección (no una tienda del catálogo)? */
export function esParadaDireccion(cod: string): boolean {
  return cod.startsWith(DIR_PREFIX);
}

/** Genera un id único `DIR-<n>` para una parada por dirección, evitando choques con los ya usados. */
export function nuevoParadaDireccionId(existentes: Iterable<string>): string {
  const set = new Set(existentes);
  let i = 1;
  while (set.has(`${DIR_PREFIX}${i}`)) i++;
  return `${DIR_PREFIX}${i}`;
}

/**
 * Patches para inyectar las paradas por dirección al ruteo/mapa: `gps` (coords por id) y
 * `tiendas` (nombre = la dirección, marcadas con `_parada` para el info-window). Puro.
 */
export function paradasDireccionPatch(paradas: ParadaDireccion[]): {
  gps: Record<string, number[]>;
  tiendas: Record<string, { n: string; z: string; v: string; _parada: boolean }>;
} {
  const gps: Record<string, number[]> = {};
  const tiendas: Record<string, { n: string; z: string; v: string; _parada: boolean }> = {};
  for (const p of paradas) {
    gps[p.id] = p.gps;
    tiendas[p.id] = { n: p.label, z: 'Dirección', v: '', _parada: true };
  }
  return { gps, tiendas };
}

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

/* ── Armar N rutas desde una lista de tiendas (Planificador desde calendario) ───
   Reparte una lista de tiendas (los códigos del día del calendario) en N rutas por
   CERCANÍA geográfica, balanceando la cantidad, y ordena cada ruta con `nn` desde la
   partida. Puro, determinista y sin capacidad de camión (el planificador es what-if). */

export interface RepartoRutas {
  /** N listas de códigos, cada una ya ordenada por cercanía desde la partida. */
  rutas: string[][];
  /** Códigos sin coordenadas (se omiten del ruteo; el UI los avisa). */
  sinGps: string[];
}

/**
 * Reparte `cods` en `n` rutas por cercanía usando un barrido angular ("sweep", clásico para ruteo
 * con depósito): ordena las tiendas por ángulo polar alrededor de la `start`, arranca el barrido en
 * el MAYOR hueco angular (para no cortar un grupo natural) y corta en N tramos de tamaño ~igual
 * (balance de cantidad). Cada tramo queda como una "cuña" compacta que sale de la partida; luego se
 * ordena con `nn`. Determinista. Los códigos sin GPS se devuelven aparte en `sinGps` (no se pierden).
 */
export function repartirEnNRutas(
  cods: string[],
  n: number,
  gps: Record<string, number[]>,
  start: number[],
): RepartoRutas {
  const nRutas = Math.max(1, Math.floor(n) || 1);
  // Dedup preservando el orden de entrada.
  const vistos = new Set<string>();
  const unicos = cods.filter(c => (vistos.has(c) ? false : (vistos.add(c), true)));
  const tieneGps = (c: string) => Array.isArray(gps[c]) && gps[c].length >= 2;
  const conGps = unicos.filter(tieneGps);
  const sinGps = unicos.filter(c => !tieneGps(c));

  const vacio = (): string[][] => Array.from({ length: nRutas }, () => []);
  if (conGps.length === 0) return { rutas: vacio(), sinGps };

  const ordenarCercania = (grupo: string[]) =>
    nn(virtualStops(grupo), gps, start).map(s => s.c);

  if (nRutas === 1) return { rutas: [ordenarCercania(conGps)], sinGps };

  // Ángulo polar respecto a la partida (lat = eje Y, lng = eje X).
  const ang = (c: string) => Math.atan2(gps[c][0] - start[0], gps[c][1] - start[1]);
  const ordByAng = [...conGps].sort((a, b) => ang(a) - ang(b));

  // Arrancar el barrido justo DESPUÉS del mayor hueco angular (evita partir un grupo natural).
  let gapMax = -Infinity, cutAfter = ordByAng.length - 1;
  for (let i = 0; i < ordByAng.length; i++) {
    const cur = ang(ordByAng[i]);
    const next = i + 1 < ordByAng.length ? ang(ordByAng[i + 1]) : ang(ordByAng[0]) + 2 * Math.PI;
    const gap = next - cur;
    if (gap > gapMax) { gapMax = gap; cutAfter = i; }
  }
  const cut = (cutAfter + 1) % ordByAng.length;
  const sweep = [...ordByAng.slice(cut), ...ordByAng.slice(0, cut)];

  // Cortar en N tramos balanceados por cantidad (los primeros `extra` llevan uno más).
  const base = Math.floor(sweep.length / nRutas);
  const extra = sweep.length % nRutas;
  const rutas: string[][] = [];
  let idx = 0;
  for (let r = 0; r < nRutas; r++) {
    const size = base + (r < extra ? 1 : 0);
    rutas.push(ordenarCercania(sweep.slice(idx, idx + size)));
    idx += size;
  }
  return { rutas, sinGps };
}

/**
 * Deep link a Google Maps con la ruta (para que el conductor navegue): origin = partida y, si NO
 * hay punto de llegada, destination = última parada + waypoints = intermedias. Si se pasa `end`
 * (punto de llegada: volver al CD / a la partida / dirección), destination = `end` y TODAS las
 * paradas son waypoints en orden. Ignora cods sin coordenadas.
 */
export function googleMapsDeepLink(
  start: { lat: number; lng: number },
  orderedCods: string[],
  gps: Record<string, number[]>,
  end?: { lat: number; lng: number } | null,
): string {
  const base = 'https://www.google.com/maps/dir/?api=1&travelmode=driving';
  const origin = `&origin=${start.lat},${start.lng}`;
  const coord = (c: number[]) => `${c[0]},${c[1]}`;
  const stops = orderedCods.map(c => gps[c]).filter(Boolean) as number[][];
  if (end) {
    const dest = `&destination=${end.lat},${end.lng}`;
    const wp = stops.length ? `&waypoints=${encodeURIComponent(stops.map(coord).join('|'))}` : '';
    return base + origin + dest + wp;
  }
  if (stops.length === 0) return base + origin;
  const dest = `&destination=${coord(stops[stops.length - 1])}`;
  const mids = stops.slice(0, -1);
  const wp = mids.length ? `&waypoints=${encodeURIComponent(mids.map(coord).join('|'))}` : '';
  return base + origin + dest + wp;
}

/** km aproximado (haversine) desde `start` recorriendo `ordered` en orden; si se pasa `end` (punto
 *  de llegada) suma el tramo final desde la última parada hasta `end`. Ignora cods sin coords. */
export function kmRutaAprox(ordered: string[], gps: Record<string, number[]>, start: [number, number], end?: [number, number] | null): number {
  let k = 0;
  let prev: number[] = start;
  for (const c of ordered) { const g = gps[c]; if (g) { k += dkm(prev, g); prev = g; } }
  if (end) k += dkm(prev, end);
  return Math.round(k);
}

/** Formatea una duración en segundos a texto corto: "8 min" / "1 h 12 min". 0/undefined → ''. */
export function formatDuracion(segundos?: number): string {
  if (!segundos || segundos <= 0) return '';
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/* ── Compartir ruta (texto) ────────────────────────────────────────────────────
   Texto legible de una ruta para compartir (WhatsApp / portapapeles): una línea por
   parada con "N. COD: dirección / tipo / horario" + el link del mapa. Puro y testeable. */

export interface LineaParada {
  cod: string;
  esDireccion: boolean;
  nombre?: string;     // nombre de la tienda o, para direcciones, la dirección escrita
  direccion?: string;  // dirección de la tienda (campo `d`)
  tipo?: string;       // etiqueta de tipo (Mall / Strip Center / …)
  horario?: string;    // ventana horaria (campo `v`)
}

/**
 * Arma el texto para compartir una ruta. Cada parada:
 *  - tienda   → `N. COD: dirección / tipo / horario` (omite los campos vacíos)
 *  - dirección→ `N. Dirección: <lo que se escribió>`
 * Cierra con `Mapa: <url>` si se pasa. Sin paradas ⇒ solo el título.
 */
export function construirTextoRuta(opts: {
  titulo: string;
  lineas: LineaParada[];
  km?: number;
  mapaUrl?: string;
  /** Punto de llegada al terminar la ruta (p. ej. "CD", "la partida", una dirección). Se agrega
   *  como línea final antes del link del mapa. */
  regreso?: string;
}): string {
  const { titulo, lineas, km, mapaUrl, regreso } = opts;
  const cab = `${titulo} — ${lineas.length} parada${lineas.length === 1 ? '' : 's'}${km && km > 0 ? ` · ~${km} km` : ''}`;
  const cuerpo = lineas.map((l, i) => {
    if (l.esDireccion) return `${i + 1}. Dirección: ${(l.nombre ?? l.cod).trim()}`;
    const detalle = [l.direccion, l.tipo, l.horario].map(s => (s ?? '').trim()).filter(Boolean).join(' / ');
    return `${i + 1}. ${l.cod}${detalle ? `: ${detalle}` : (l.nombre ? `: ${l.nombre}` : '')}`;
  });
  if (regreso) cuerpo.push(`↩ Llegada: ${regreso.trim()}`);
  const partes = [cab, ...(cuerpo.length ? ['', ...cuerpo] : [])];
  if (mapaUrl) partes.push('', `Mapa: ${mapaUrl}`);
  return partes.join('\n');
}
