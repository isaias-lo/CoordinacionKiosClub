/* ── Planificador de rutas (tab MAPA) ─────────────────────────────────────────
   Helpers PUROS del planificador visual: búsqueda de tiendas, "paradas virtuales"
   para reusar dibMapa/nn, y deep-link a Google Maps para el conductor. Sin DOM ni red. */

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
}): string {
  const { titulo, lineas, km, mapaUrl } = opts;
  const cab = `${titulo} — ${lineas.length} parada${lineas.length === 1 ? '' : 's'}${km && km > 0 ? ` · ~${km} km` : ''}`;
  const cuerpo = lineas.map((l, i) => {
    if (l.esDireccion) return `${i + 1}. Dirección: ${(l.nombre ?? l.cod).trim()}`;
    const detalle = [l.direccion, l.tipo, l.horario].map(s => (s ?? '').trim()).filter(Boolean).join(' / ');
    return `${i + 1}. ${l.cod}${detalle ? `: ${detalle}` : (l.nombre ? `: ${l.nombre}` : '')}`;
  });
  const partes = [cab, ...(cuerpo.length ? ['', ...cuerpo] : [])];
  if (mapaUrl) partes.push('', `Mapa: ${mapaUrl}`);
  return partes.join('\n');
}
