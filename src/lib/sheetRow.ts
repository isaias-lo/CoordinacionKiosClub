/* ── Escritura de filas a Google Sheets POR NOMBRE DE ENCABEZADO ──────────────
   El problema histórico: las filas se escribían por posición (col A, B, C…), así
   que reordenar columnas en la hoja cruzaba los datos. Este helper alinea cada
   valor a su columna buscando por el TÍTULO del encabezado (no por posición), de
   modo que las columnas se pueden mover/reordenar libremente sin cruces.

   `record` va con claves = etiquetas canónicas del encabezado (ej. "Fecha/Hora").
   Se testea en __tests__. Función pura: sin red ni Google API. */

export type SheetValue = string | number;

/** Normaliza un encabezado para comparar sin fallar por mayúsculas/espacios/acentos triviales. */
export function normalizeHeader(h: string): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Devuelve la fila lista para `append`, con cada valor bajo su encabezado.
 * - `headers`: la fila 1 REAL de la hoja (en su orden actual, aunque el usuario la haya reordenado).
 * - `record`: datos con clave = etiqueta del encabezado.
 * Encabezados sin dato → ''. Datos sin encabezado en la hoja → se ignoran (no rompen).
 * Si la hoja no tiene encabezados (`headers` vacío), cae a escribir los valores del
 * record en su orden de inserción (respaldo posicional para no perder el dato).
 */
export function buildSheetRow(headers: string[], record: Record<string, SheetValue>): SheetValue[] {
  if (!headers || headers.length === 0) {
    return Object.values(record);
  }
  const byNorm = new Map<string, SheetValue>();
  for (const [k, v] of Object.entries(record)) {
    byNorm.set(normalizeHeader(k), v);
  }
  return headers.map(h => {
    const v = byNorm.get(normalizeHeader(h));
    return v === undefined || v === null ? '' : v;
  });
}
