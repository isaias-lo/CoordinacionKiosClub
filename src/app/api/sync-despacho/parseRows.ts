/**
 * Lectura de DESPACHO RM / DESPACHO REGIONES desde Google Sheets por NOMBRE de encabezado
 * (no por posición). Así las columnas de esas hojas se pueden reordenar sin cruzar datos.
 *
 * Puro y testeable. La ruta (sync-despacho/route.ts) pasa la fila de encabezados (values[0]).
 * Cada campo se lee por su etiqueta; si la etiqueta no aparece, cae a una posición de respaldo
 * (la posición ACTUAL correcta de la hoja) para degradar sin romper.
 */

/** Normaliza un encabezado: trim + mayúsculas + sin acentos (para comparar robusto). */
export function normHeader(h: unknown): string {
  return String(h ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function num(v: unknown): number | null {
  const p = parseFloat(String(v ?? ''));
  return isNaN(p) ? null : p;
}

/** ¿La fila es de datos? (id no vacío y no es la fila de encabezado). */
export function isDataRow(row: (string | number)[]): boolean {
  const id = String(row[0] ?? '').trim();
  return id !== '' && id.toLowerCase() !== 'id';
}

/** Etiquetas de encabezado que cada hoja debe tener (para avisar si alguna cambió). */
export const RM_HEADERS = [
  'ID', 'FECHA', 'COD', 'TIENDA', 'TIPO', 'REGIMEN', 'TRANSPORTE', 'PATENTE', 'CARGA', 'REGION',
  'COMUNA', 'TIPO_COMUNA', 'PESO_KG', 'ALTO', 'LARGO', 'ANCHO', 'PESO_V', 'VENTANA', 'ESTADO',
  'N_PALLET_BULTO', 'FECHA_LLEGADA', 'CONDUCTOR', 'RUTA', 'SUPERVISOR', 'PIONETA 1', 'PIONETA 2',
];
export const REGIONES_HEADERS = [
  'ID', 'FECHA', 'COD', 'TIENDA', 'TIPO', 'REGIMEN', 'TRANSPORTE', 'PATENTE', 'CARGA', 'REGION',
  'COMUNA', 'TIPO_COMUNA', 'PESO_KG', 'ALTO', 'LARGO', 'ANCHO', 'PESO_V', 'VENTANA', 'ESTADO',
  'N_PALLET_BULTO', 'FECHA_LLEGADA', 'GUIA', 'VALOR',
];

/** Etiquetas esperadas que NO aparecen en el encabezado real → esos campos caen a fallback
 *  posicional. Sirve para loggear y detectar si alguien renombró/cambió una columna. */
export function missingHeaders(headers: (string | number)[], expected: string[]): string[] {
  const present = new Set(headers.map(normHeader));
  return expected.filter(e => !present.has(normHeader(e)));
}

/** Getter por nombre de encabezado con fallback a una posición fija. */
export function makeReader(headers: (string | number)[]) {
  const idx = new Map<string, number>();
  headers.forEach((h, i) => { const k = normHeader(h); if (k && !idx.has(k)) idx.set(k, i); });
  return (row: (string | number)[], header: string, fallbackPos: number): string => {
    const i = idx.get(normHeader(header));
    return String(row[i !== undefined ? i : fallbackPos] ?? '');
  };
}

/** Campos comunes a RM y REGIONES (id … fecha_llegada). `get` es el reader por encabezado. */
function baseRecord(get: (row: (string | number)[], header: string, pos: number) => string, row: (string | number)[]) {
  return {
    id:             get(row, 'ID', 0),
    fecha:          get(row, 'FECHA', 1),
    cod:            get(row, 'COD', 2),
    tienda:         get(row, 'TIENDA', 3),
    tipo:           get(row, 'TIPO', 4),
    regimen:        get(row, 'REGIMEN', 5),
    transporte:     get(row, 'TRANSPORTE', 6),
    patente:        get(row, 'PATENTE', 7),
    carga:          get(row, 'CARGA', 8),
    region:         get(row, 'REGION', 9),
    comuna:         get(row, 'COMUNA', 10),
    tipo_comuna:    get(row, 'TIPO_COMUNA', 11),
    peso_kg:        num(get(row, 'PESO_KG', 12)),
    alto:           num(get(row, 'ALTO', 13)),
    largo:          num(get(row, 'LARGO', 14)),
    ancho:          num(get(row, 'ANCHO', 15)),
    peso_v:         num(get(row, 'PESO_V', 16)),
    ventana:        get(row, 'VENTANA', 17),
    estado:         get(row, 'ESTADO', 18),
    n_pallet_bulto: get(row, 'N_PALLET_BULTO', 19),
    fecha_llegada:  get(row, 'FECHA_LLEGADA', 20),
  };
}

export function makeRmMapper(headers: (string | number)[]) {
  const get = makeReader(headers);
  return (row: (string | number)[]) => {
    const p1 = get(row, 'PIONETA 1', 26);
    const p2 = get(row, 'PIONETA 2', 27);
    return {
      ...baseRecord(get, row),
      conductor:   get(row, 'CONDUCTOR', 21),
      ruta:        get(row, 'RUTA', 22),
      supervisor:  get(row, 'SUPERVISOR', 23),
      pioneta_1:   p1 ? p1 : null,
      pioneta_2:   p2 ? p2 : null,
      seguimiento: 'Registrado',
    };
  };
}

export function makeRegionesMapper(headers: (string | number)[]) {
  const get = makeReader(headers);
  return (row: (string | number)[]) => ({
    ...baseRecord(get, row),
    // OJO: la hoja tiene GUIA en col 24 y VALOR en 25 (no 21/22 como asumía la lectura
    // posicional anterior, que leía CONDUCTOR/RUTA por error). Por nombre queda correcto.
    guia:        get(row, 'GUIA', 24),
    valor:       num(get(row, 'VALOR', 25)),
    seguimiento: 'Registrado',
  });
}
