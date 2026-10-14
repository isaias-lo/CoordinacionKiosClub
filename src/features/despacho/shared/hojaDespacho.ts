// Las hojas DESPACHO RM y DESPACHO REGIONES: sus columnas y cómo colocar una fila. Puro.
//
// ── QUÉ CAMBIA ─────────────────────────────────────────────────────────────────────────────────
//
// Estas dos hojas se escribían POR POSICIÓN: el código ponía el estado en la columna 18 porque
// contaba A, B, C… hasta la 18. Mover una columna de lugar corría todo lo que sigue y rompía el
// parser **sin dar un solo error** — por eso la regla del repositorio era «nunca reordenar, solo
// agregar al final».
//
// Acá se corta esa limitación. Antes de escribir se lee el encabezado REAL de la hoja y cada valor
// se coloca en la columna que lleva su nombre. Entonces:
//
//   · Se pueden mover las columnas de lugar.
//   · Se pueden insertar columnas propias en el medio.
//   · Se puede agregar una columna a mano —una nota, un responsable— y el sistema NO la pisa.
//   · Una columna nueva del sistema se estrena sola, al final, sin que nadie la cree a mano.
//
// No es un invento: es exactamente lo que ya hacen CRUCE PESOS (ver `hojaCrucePesos.ts`) y, desde
// el #212, ENTREGA/TIENDA y RECEPCIÓN/TIENDA. Lo único nuevo es traerlo a las hojas de despacho.
//
// ── POR QUÉ EL ORDEN CANÓNICO SIGUE EXISTIENDO ─────────────────────────────────────────────────
//
// Todo lo que está aguas arriba —`buildRows` de los dos espejos, el respaldo del Enrutador, el
// espejo a Supabase— sigue armando la fila en el orden de `COLUMNAS_DESPACHO`. Eso NO es deuda:
// es lo que mantiene el cambio chico y verificable. Lo único que se vuelve consciente del nombre
// es el último paso, cuando la fila se coloca en la hoja.

/** Normaliza un encabezado para comparar: sin acentos, sin espacios de más, en mayúsculas. */
export function normalizarColumna(c: unknown): string {
  return String(c ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Las columnas del sistema, EN EL ORDEN CANÓNICO en que las arma `buildRows`.
 *
 * Este orden ya no manda sobre la hoja —manda el nombre— pero sí sobre la fila que viaja por el
 * código. Agregar una columna nueva al final de esta lista es todo lo que hace falta: la hoja la
 * estrena sola.
 */
export const COLUMNAS_DESPACHO = [
  'ID', 'FECHA', 'COD', 'TIENDA', 'TIPO', 'REGIMEN', 'TRANSPORTE', 'PATENTE', 'CARGA', 'REGION',
  'COMUNA', 'TIPO_COMUNA', 'PESO_KG', 'ALTO', 'LARGO', 'ANCHO', 'PESO_V', 'VENTANA', 'ESTADO',
  'N_PALLET_BULTO', 'FECHA_LLEGADA', 'CONDUCTOR', 'RUTA', 'SUPERVISOR', 'GUIA', 'VALOR',
  'PIONETA 1', 'PIONETA 2', 'FECHA ARMADO', 'CÓDIGO',
] as const;

/**
 * Nombres que alguien pudo haberle puesto a una columna del sistema.
 *
 * Existe por lo que pasó en CRUCE PESOS el 30/09: renombraron TOTAL BODEGA a «TOTAL Físico», que
 * describía mejor lo que había adentro, y sin alias la siguiente escritura habría agregado una
 * columna nueva vacía mientras la renombrada se congelaba. Acá se adelanta el mismo problema.
 */
export const ALIAS_DESPACHO: Record<string, string> = {
  'CODIGO': 'CÓDIGO',
  'N PALLET BULTO': 'N_PALLET_BULTO',
  'N° PALLET/BULTO': 'N_PALLET_BULTO',
  'FECHA_ARMADO': 'FECHA ARMADO',
  'FECHA LLEGADA': 'FECHA_LLEGADA',
  'PESO KG': 'PESO_KG',
  'PESO V': 'PESO_V',
  'TIPO COMUNA': 'TIPO_COMUNA',
  'PIONETA1': 'PIONETA 1',
  'PIONETA2': 'PIONETA 2',
};

/** Dónde está cada columna del sistema en la hoja REAL, resolviendo los alias. */
export function indicesDeEncabezado(encabezado: readonly unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  encabezado.forEach((c, i) => {
    const bruto = normalizarColumna(c);
    if (!bruto) return;
    const k = ALIAS_DESPACHO[bruto] ?? bruto;
    if (!(k in out)) out[k] = i;   // ante un nombre repetido, manda el primero
  });
  return out;
}

/**
 * Las columnas del sistema que la hoja todavía no tiene, en orden canónico.
 *
 * Se agregan al final del encabezado antes de escribir. Así una columna nueva —la referencia de
 * Odoo, el batch— aparece sola la primera vez que se registra, sin que nadie la cree a mano y sin
 * que el día quede sin su dato.
 */
export function columnasQueFaltan(encabezado: readonly unknown[]): string[] {
  const idx = indicesDeEncabezado(encabezado);
  return COLUMNAS_DESPACHO.filter(c => !(c in idx));
}

/** El encabezado que debería quedar: el de la hoja más las columnas del sistema que falten. */
export function encabezadoCompleto(encabezado: readonly unknown[]): string[] {
  const actual = encabezado.map(c => String(c ?? ''));
  return [...actual, ...columnasQueFaltan(encabezado)];
}

/**
 * Coloca una fila canónica en las posiciones que dicta el encabezado REAL.
 *
 * Lo que la hoja tiene y el sistema no conoce —una columna agregada a mano— queda VACÍO en las
 * filas nuevas y, en una actualización, se conserva lo que hubiera. Nunca se pisa.
 */
export function alinearFila(
  encabezado: readonly unknown[], filaCanonica: readonly (string | number)[],
): (string | number)[] {
  const idx = indicesDeEncabezado(encabezado);
  const ancho = Math.max(encabezado.length, ...Object.values(idx).map(i => i + 1), 1);
  const out: (string | number)[] = new Array(ancho).fill('');
  COLUMNAS_DESPACHO.forEach((nombre, i) => {
    const destino = idx[nombre];
    if (destino === undefined) return;          // la hoja no tiene esa columna
    out[destino] = filaCanonica[i] ?? '';
  });
  return out;
}

/**
 * El valor de una columna del sistema en una fila LEÍDA de la hoja.
 *
 * `posicionCanonica` es el respaldo para una hoja cuyo encabezado no se pudo leer (una respuesta
 * recortada, una hoja recién creada). Sin ese respaldo, un encabezado ausente convertiría toda
 * lectura en vacío, que es peor que leer por posición: el vacío no se nota.
 */
export function leerColumna(
  encabezado: readonly unknown[], fila: readonly unknown[], nombre: string,
): string {
  const idx = indicesDeEncabezado(encabezado);
  const i = idx[normalizarColumna(nombre)];
  const canonica = COLUMNAS_DESPACHO.indexOf(nombre as typeof COLUMNAS_DESPACHO[number]);
  const pos = i !== undefined ? i : canonica;
  return pos < 0 ? '' : String(fila[pos] ?? '');
}
