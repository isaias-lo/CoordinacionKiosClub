// Catálogo de SECTORES de tienda — la columna SECTOR/COMUNA de la hoja TIENDAS, editable desde
// Config. Tiendas.
//
// Es el campo que decide en qué zona rutea cada tienda, así que un typo la cambia de camión: si
// alguien escribe "Costas" o deja "V Región", el Enrutador la clasifica distinto. Por eso el
// formulario ofrece una lista cerrada en vez de texto libre, y acá vive esa lista junto con la
// regla de a qué zona corresponde cada valor — una sola definición para el formulario y el motor.

/**
 * Zona de transporte. Cada una se despacha distinto y nunca comparten camión.
 *
 * `sur` y `norte` salen de partir Regiones, porque desde el 31/08/2026 las lleva gente
 * distinta: Luis Fica tomó todo el sur y Falabella mantiene el norte (Antofagasta ×2 y
 * La Serena ×2). Antes bastaba con una sola zona 'regiones' porque Falabella hacía todo.
 *
 * OJO: esto NO es el grupo `'fal'` del calendario y del picking, que sigue tratando Regiones
 * como una sola cosa. Partir aquel identificador implicaría tocar 95 referencias en 32
 * archivos sin ningún beneficio: lo único que necesita distinguir sur de norte es quién
 * transporta.
 */
export type ZonaRuteo = 'santiago' | 'costa' | 'sur' | 'norte';

/**
 * Latitud del CD. Es el corte que separa norte de sur cuando el sector dice 'Región' a secas.
 *
 * Vivía como número suelto dentro del motor. Ahora está acá, junto a la regla que lo usa, para que
 * el calendario y el motor no puedan quedar partiendo el mapa por lugares distintos.
 */
export const LAT_CD_DEFAULT = -33.412581;

export interface SectorOpcion {
  valor: string;
  zona: ZonaRuteo;
  /** Qué implica en la operación, para mostrarlo junto a la opción. */
  detalle: string;
}

/**
 * Los sectores válidos. Los cinco "Corredor …" son los de Santiago; Costa son las cinco tiendas
 * de la V Región que salen del CD en camión propio (Quilpué, Curauma, Viña, Reñaca, Concón);
 * Región es todo lo que sale por Sendu.
 */
export const SECTORES: SectorOpcion[] = [
  { valor: 'Corredor Oriente',     zona: 'santiago', detalle: 'Santiago' },
  { valor: 'Corredor Poniente',    zona: 'santiago', detalle: 'Santiago' },
  { valor: 'Corredor Norte',       zona: 'santiago', detalle: 'Santiago' },
  { valor: 'Corredor Sur',         zona: 'santiago', detalle: 'Santiago' },
  { valor: 'Corredor Providencia', zona: 'santiago', detalle: 'Santiago' },
  { valor: 'Costa',                zona: 'costa',    detalle: 'camión propio desde el CD' },
  { valor: 'Región Sur',           zona: 'sur',      detalle: 'consolida al sur' },
  { valor: 'Región Norte',         zona: 'norte',    detalle: 'consolida al norte' },
  // 'Región' a secas queda para las fichas cargadas antes de la separación: la zona se
  // deduce de la latitud (ver `zonaDeSectorOGeo`). No se muestra como opción nueva.
];

/** Igual que SECTORES pero incluyendo 'Región' a secas, para reconocerlo como canónico. */
const SECTOR_LEGACY: SectorOpcion =
  { valor: 'Región', zona: 'sur', detalle: 'sin separar — la zona sale de la latitud' };

/**
 * Zona a la que pertenece un valor de sector. Tolera mayúsculas, acentos y espacios de más, pero
 * no adivina variantes: cualquier cosa que no empiece con "costa" ni con "regi" se rutea como
 * Santiago, que es el caso de las comunas sueltas que hay cargadas ('Las Condes', 'Ñuñoa').
 * Sector vacío → null, para que el llamador decida el respaldo.
 */
export function zonaDeSector(sector: string | null | undefined): ZonaRuteo | null {
  const s = String(sector ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('costa')) return 'costa';
  if (s.startsWith('regi')) {
    if (s.includes('norte')) return 'norte';
    if (s.includes('sur'))   return 'sur';
    return null;   // 'Región' a secas: hace falta la latitud para saber cuál
  }
  return 'santiago';
}

/**
 * Zona de una tienda, con la latitud como desempate.
 *
 * Las 17 fichas cargadas antes de la separación dicen 'Región' a secas. La latitud las
 * separa sin ambigüedad: el CD está en −33,41 y ninguna tienda de Regiones queda cerca de
 * esa latitud — la más al norte es La Serena (−29,9) y la más al sur Machalí (−34,2). Así
 * no hay que editar 17 fichas a mano, y el desplegable queda para las excepciones.
 */
export function zonaDeSectorOGeo(
  sector: string | null | undefined,
  lat: number | null | undefined,
  latCD: number = LAT_CD_DEFAULT,
): ZonaRuteo | null {
  const porSector = zonaDeSector(sector);
  if (porSector) return porSector;
  const esRegion = String(sector ?? '').trim().toLowerCase().startsWith('regi');
  if (!esRegion) return null;
  if (lat == null || !Number.isFinite(lat)) return 'sur';   // sin GPS: el sur es lo más común
  return lat < latCD ? 'sur' : 'norte';
}

/** true si el valor es uno de la lista cerrada. */
export function esSectorCanonico(sector: string | null | undefined): boolean {
  const s = String(sector ?? '').trim();
  return SECTORES.some(o => o.valor === s) || s === SECTOR_LEGACY.valor;
}

/**
 * Opciones a mostrar en el desplegable. Si la tienda ya tiene un valor fuera de la lista (hay
 * comunas sueltas cargadas de antes), se agrega al final para NO perderlo al abrir el formulario.
 */
export function opcionesSector(actual: string | null | undefined): SectorOpcion[] {
  const s = String(actual ?? '').trim();
  // 'Región' a secas se muestra al final, para que se vea que conviene precisar sur o norte.
  if (s === SECTOR_LEGACY.valor) return [...SECTORES, SECTOR_LEGACY];
  if (!s || esSectorCanonico(s)) return SECTORES;
  const zona = zonaDeSector(s) ?? 'santiago';
  return [...SECTORES, { valor: s, zona, detalle: `valor actual · rutea como ${zona}` }];
}

/**
 * ¿Es una tienda de Regiones que consolida al NORTE? (Antofagasta ×2, La Serena ×2 hoy.)
 *
 * Reemplaza la lista de cuatro códigos que estaba escrita a mano en el calendario y en la ruta que
 * escribe la hoja. Esa lista era correcta, pero no tenía forma de enterarse: una tienda nueva en
 * Copiapó o Iquique se habría pintado "sur" sin que nada avisara, y habría salido en el camión
 * equivocado del papel que usa la operación.
 *
 * Devuelve `false` para lo que no es Regiones, así se puede llamar sobre cualquier código.
 */
export function esRegionNorte(
  sector: string | null | undefined,
  lat: number | null | undefined,
  latCD: number = LAT_CD_DEFAULT,
): boolean {
  return zonaDeSectorOGeo(sector, lat, latCD) === 'norte';
}
