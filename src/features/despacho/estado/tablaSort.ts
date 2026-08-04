// Helpers puros de orden/comparación de celdas para la tabla del panel Estado/Registros.
// Separados del componente (tablaHelpers.tsx) para poder testearlos sin JSX (vitest environment node).

/** Columnas que se ordenan/comparan como fecha (DD/MM/YYYY o ISO). */
export const DATE_COLS = new Set(['fecha', 'created_at']);

/** Convierte un valor a milisegundos para ordenar por fecha. Soporta DD/MM/YYYY e ISO. Puro. */
export function dateMs(val: unknown): number {
  const s = String(val ?? '').trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  const t = Date.parse(s);
  return isNaN(t) ? -Infinity : t;
}

/** Comparador de celdas para ordenar una columna: fecha, número o texto (locale es). Puro. */
export function compareCells(col: string, a: unknown, b: unknown): number {
  if (DATE_COLS.has(col)) return dateMs(a) - dateMs(b);
  const an = Number(a), bn = Number(b);
  const aNum = String(a ?? '').trim() !== '' && !isNaN(an);
  const bNum = String(b ?? '').trim() !== '' && !isNaN(bn);
  if (aNum && bNum) return an - bn;
  return String(a ?? '').localeCompare(String(b ?? ''), 'es');
}
