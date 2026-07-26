// Parseo puro de filas del Sheet TIENDAS → objeto tienda (para "Sheets → DB").
// Extraído del handler para poder testearlo sin red ni Google API.
import { normalizeCod } from './normalizeCod';
import { parseActivo } from '../activo';

/** parseFloat tolerante a coma decimal (es-CL escribe "-33,4" en el Sheet). */
export function parseDecimal(s: unknown): number | null {
  const str = String(s ?? '').trim();
  if (!str) return null;
  const n = parseFloat(str.replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** ¿La primera celda parece un título/encabezado (no una tienda real)? */
export function looksLikeHeader(raw: string): boolean {
  return !raw
    || raw.length > 15                                 // título demasiado largo
    || /[⚡📦🏪|—–]/u.test(raw)                        // emojis o separadores de título
    || /^(CÓDIGO|COD|TIENDA|NOMBRE|N°|#)/i.test(raw);  // encabezados de columna
}

/** Mapea una fila del Sheet (columnas A–R) al objeto de la tabla `tiendas`. */
export function rowToTienda(row: (string | undefined)[]): Record<string, unknown> {
  return {
    codigo:         normalizeCod(String(row[0] ?? '')),
    nombre:         row[1]?.trim() ?? '',
    direccion:      row[2]?.trim() ?? '',
    region:         row[3]?.trim() ?? '',
    sector_comuna:  row[4]?.trim() ?? '',
    corredor:       row[5]?.trim() ?? '',
    tipo:           row[6]?.trim() ?? '',
    ventana:        row[7]?.trim() ?? '',
    frecuencia:     row[8]?.trim() ?? '',
    prom_por_dia:   row[9]?.trim() ?? '',
    lat:            parseDecimal(row[10]),
    lon:            parseDecimal(row[11]),
    correos:        row[12]?.trim() ?? '',
    tel_encargado:  row[13]?.trim() ?? '',
    supervisor:     row[14]?.trim() ?? '',
    tel_supervisor: row[15]?.trim() ?? '',
    transportista:  row[16]?.trim() ?? '',
    activo:         parseActivo(row[17]),
  };
}
