// Catálogo de SECTORES de tienda — la columna SECTOR/COMUNA de la hoja TIENDAS, editable desde
// Config. Tiendas.
//
// Es el campo que decide en qué zona rutea cada tienda, así que un typo la cambia de camión: si
// alguien escribe "Costas" o deja "V Región", el Enrutador la clasifica distinto. Por eso el
// formulario ofrece una lista cerrada en vez de texto libre, y acá vive esa lista junto con la
// regla de a qué zona corresponde cada valor — una sola definición para el formulario y el motor.

/** Zona de ruteo. Cada una se despacha distinto y nunca comparten camión. */
export type ZonaRuteo = 'santiago' | 'costa' | 'regiones';

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
  { valor: 'Región',               zona: 'regiones', detalle: 'sale por Regiones' },
];

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
  if (s.startsWith('regi'))  return 'regiones';
  return 'santiago';
}

/** true si el valor es uno de la lista cerrada. */
export function esSectorCanonico(sector: string | null | undefined): boolean {
  const s = String(sector ?? '').trim();
  return SECTORES.some(o => o.valor === s);
}

/**
 * Opciones a mostrar en el desplegable. Si la tienda ya tiene un valor fuera de la lista (hay
 * comunas sueltas cargadas de antes), se agrega al final para NO perderlo al abrir el formulario.
 */
export function opcionesSector(actual: string | null | undefined): SectorOpcion[] {
  const s = String(actual ?? '').trim();
  if (!s || esSectorCanonico(s)) return SECTORES;
  const zona = zonaDeSector(s) ?? 'santiago';
  return [...SECTORES, { valor: s, zona, detalle: `valor actual · rutea como ${zona}` }];
}
