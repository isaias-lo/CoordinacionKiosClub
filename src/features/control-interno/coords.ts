/**
 * Parsea una coordenada TECLEADA a número, aceptando coma O punto decimal.
 *
 * Los inputs de lat/lon eran `type="number"`, que en formato chileno (coma decimal) rechaza el
 * valor: al teclear "-39,81834" el campo queda vacío y la coordenada se guardaba como null (el
 * usuario veía que "no se guardaban las coordenadas"). Este parser normaliza la coma a punto y
 * valida el rango; se usa con inputs `type="text"` para permitir teclear la coma.
 *
 * Devuelve null si está vacía, incompleta ("-", ".") o fuera de rango. Puro y testeable.
 * @param max  cota del valor absoluto: 90 para latitud, 180 para longitud.
 */
export function parseCoord(raw: string, max = 180): number | null {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '' || s === '-' || s === '.' || s === '-.') return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < -max || n > max) return null;
  return n;
}
