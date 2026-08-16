import type { CalRecord } from '@/lib/calendarioCongeladosSync';

const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'] as const;

/** Encabezados de columna B..H de la hoja "CALENDARIO CONG." (fila 2), en orden LU..DO. */
export const HEADER_ROW = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

/**
 * Formatea un código de tienda separando los dígitos iniciales del resto con un espacio.
 * Ej: '16PQA' → '16 PQA', '01TPS' → '01 TPS'. Si no matchea el patrón, devuelve tal cual.
 * Idéntico al `fmtCod` de src/app/api/calendario-write/route.ts (misma normalización
 * de Peñalolén/Viña, para que ambos respaldos usen la misma convención de nombres).
 */
export function fmtCod(raw: string): string {
  const m = raw.match(/^(\d+)([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9]*)$/i);
  return m ? `${m[1]} ${m[2].toUpperCase().replace('PEN', 'PEÑ').replace('VIN', 'VIÑ')}` : raw;
}

export interface SerializedCongeladosSheet {
  /** Encabezados de columna B..H (LUNES..DOMINGO) — 7 columnas, SIN la col A ("No."). */
  headerRow: string[];
  /**
   * Matriz transpuesta con las 7 columnas de días (B..H), SIN la col A: cada fila tiene
   * exactamente 7 celdas, una por día (LU..DO), rellenadas con '' cuando ese día no tiene
   * más códigos en esa posición. NO incluye la col A ("No.") porque esos números ya existen
   * en la hoja y no se deben pisar — la ruta que escribe debe limitarse a B..H.
   */
  dataRows: string[][];
  /** Cantidad de filas de datos (= mayor cantidad de códigos entre los 7 días). */
  numRows: number;
}

/**
 * Serializa el CalRecord del calendario de Congelados al formato de la hoja
 * "CALENDARIO CONG.": por cada día (LU..DO) aplana los códigos como
 * `rm.concat(costa, fal)` (en ese orden), formateados con `fmtCod`, y arma una matriz
 * transpuesta (una fila por posición, una columna por día) lista para escribir en
 * el rango B3:H{2+numRows}. No toca la columna A ni la fila de título.
 */
export function serializeCongeladosSheet(cal: CalRecord): SerializedCongeladosSheet {
  const porDia = DIAS.map(dia => {
    const entry = cal[dia];
    const codigos = entry ? entry.rm.concat(entry.costa, entry.fal) : [];
    return codigos.map(fmtCod);
  });

  const numRows = Math.max(0, ...porDia.map(codigos => codigos.length));

  const dataRows: string[][] = [];
  for (let r = 0; r < numRows; r++) {
    dataRows.push(porDia.map(codigos => codigos[r] ?? ''));
  }

  return { headerRow: HEADER_ROW, dataRows, numRows };
}
