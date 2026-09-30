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

/**
 * Un número de la planilla. **La coma es separador decimal.**
 *
 * `sync-despacho` lee las hojas con `values.get` sin `valueRenderOption`, o sea FORMATEADAS, y la
 * planilla está en formato chileno: una celda que vale `239.5` vuelve como el texto `"239,5"`.
 * `parseFloat("239,5")` corta en la coma y devuelve **239** sin quejarse.
 *
 * Es el MISMO bug de la coma que el #608 arregló en el campo de peso de Bodega, una capa más
 * abajo: ahí la persona escribía la coma y el navegador la descartaba; acá la escribe Google y la
 * descarta `parseFloat`.
 *
 * Medido el 30/09 sobre las dos hojas: **273 filas** (195 en DESPACHO RM y 78 en DESPACHO
 * REGIONES) tenían un decimal que se perdía en cada sincronización. Sobre los dos días ya
 * registrados eran 82 unidades y 39,9 kg — medio kilo por fila, todos los días.
 *
 * Por eso ALGUNAS filas conservaban su decimal y otras no, que era lo desconcertante: las que
 * escribe el espejo de `sheets-write` nunca pasan por la hoja y llegan enteras; las que vuelven
 * por `sync-despacho` sí pasan, y se truncan.
 *
 * ── LA REGLA, Y POR QUÉ ESTA Y NO LA DE `leerPeso` ─────────────────────────────────────────────
 *
 * Si hay una coma, la coma es el decimal y los puntos son separadores de miles. Si no hay coma,
 * el punto es el decimal, **exactamente como hasta hoy**.
 *
 * `leerPeso` usa otra regla —"manda el último separador, sea cual sea"— y ahí es correcta porque
 * en ese campo nada llega a los mil kilos, así que «1.200» es mucho más probablemente 1,2. Acá
 * no se puede suponer eso: `num` también lee VALOR, que sí puede ser un monto grande, y cambiarle
 * el sentido a un punto sin coma habría convertido «1.234» en 1,234 en una columna de plata.
 *
 * O sea: esto AGREGA el caso de la coma y no toca ninguno de los que ya funcionaban.
 */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const crudo = String(v ?? '').trim();
  if (!crudo.includes(',')) {
    const p = parseFloat(crudo);
    return isNaN(p) ? null : p;
  }
  // Con coma presente: los puntos son de miles y la coma es el decimal.
  const negativo = crudo.trimStart().startsWith('-');
  const limpio = crudo.replace(/[^\d.,]/g, '').replace(/\./g, '');
  const [entero, ...resto] = limpio.split(',');
  const decimal = resto.join('');
  if (!/\d/.test(limpio)) return null;
  const n = Number(`${entero || '0'}.${decimal || '0'}`);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * El CÓDIGO de la hoja como id de unidad: solo un entero limpio, o null.
 *
 * `num` NO sirve acá: `parseFloat('49PTA')` devuelve 49, y ese 49 sería el id de OTRA unidad. Como
 * ese id se usa para sacar filas del despacho cuando la unidad se borra, un valor inventado borra
 * la fila equivocada. Ante la duda, null: sin vínculo se pierde la limpieza automática de esa fila,
 * que es mucho menos grave que borrar carga ajena.
 */
export function idUnidad(v: unknown): number | null {
  const s = String(v ?? '').trim();
  return /^\d+$/.test(s) ? Number(s) : null;
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
  'CÓDIGO',
];
export const REGIONES_HEADERS = [
  'ID', 'FECHA', 'COD', 'TIENDA', 'TIPO', 'REGIMEN', 'TRANSPORTE', 'PATENTE', 'CARGA', 'REGION',
  'COMUNA', 'TIPO_COMUNA', 'PESO_KG', 'ALTO', 'LARGO', 'ANCHO', 'PESO_V', 'VENTANA', 'ESTADO',
  'N_PALLET_BULTO', 'FECHA_LLEGADA', 'GUIA', 'VALOR', 'CÓDIGO',
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
    // CÓDIGO (col AD) = id de la unidad en picking_pallets. Sin esto, toda fila que entra por la
    // sincronización pierde el vínculo con su unidad — y era el 100% de las filas de días pasados.
    // Ese vínculo es lo que permite sacar la fila del despacho cuando la unidad se borra en
    // Picking; sin él, un pallet borrado seguía viajando en el papel (51SER, 11/09/2026).
    picking_slot_id: idUnidad(get(row, 'CÓDIGO', 29)),
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
