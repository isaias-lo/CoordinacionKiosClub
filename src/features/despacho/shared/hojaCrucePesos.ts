// La hoja CRUCE PESOS: sus columnas y cómo se arma una fila. Puro y testeable.
//
// ESTA HOJA SE ESCRIBE POR NOMBRE DE COLUMNA, NO POR POSICIÓN.
//
// El resto de las hojas del sistema son posicionales: se escribe en la A, la B, la C, y mover una
// columna de lugar corre todo lo que sigue y rompe el parser sin dar error. Por eso la regla del
// repositorio es "nunca reordenar, solo agregar al final".
//
// Acá no. Antes de escribir se lee el encabezado REAL de la hoja y cada valor se coloca en la
// columna que lleva su nombre. Entonces:
//
//   · Se pueden mover las columnas de lugar.
//   · Se pueden insertar columnas propias en el medio.
//   · Se puede agregar una columna a mano —una nota, un responsable— y el sistema NO la pisa:
//     al actualizar una fila solo toca las celdas que conoce y deja el resto como estaba.
//
// Lo único que no se puede es RENOMBRAR una columna del sistema: ahí deja de encontrarse. Por eso
// el nombre se compara sin acentos ni mayúsculas, para que «CODIGO» y «Código» sigan calzando.
//
// El precedente en este repositorio son ENTREGA/TIENDA y RECEPCIÓN/TIENDA, por nombre desde #212.

import { TIPOS_CRUCE, refsParaCelda, pctDiferencia, type FilaCruce } from './cruceDePesos';

/** Las columnas del sistema, en el orden con que nace la hoja. Después se pueden mover. */
export const ENCABEZADO_CRUCE = [
  'FECHA',
  'CÓDIGO',
  'TIENDA',
  'REF COMIDA',
  'KG COMIDA',
  'REF ASEO',
  'KG ASEO',
  'REF HOGAR',
  'KG HOGAR',
  'REF CHOCOLATE',
  'KG CHOCOLATE',
  'TOTAL ODOO',
  'TOTAL BODEGA',
  '% DIF',
  'ACTUALIZADO',
] as const;

/** El nombre de la pestaña. */
export const HOJA_CRUCE = 'CRUCE PESOS';

/** Las dos columnas que identifican una fila. Se buscan por nombre, como todas. */
export const COL_LLAVE = ['FECHA', 'CÓDIGO'] as const;

/** Compara nombres de columna sin acentos, espacios de más ni mayúsculas. */
export function normalizarColumna(nombre: string): string {
  return String(nombre ?? '').trim().toUpperCase()
    .replace(/[ÁÀÂÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U')
    .replace(/\s+/g, ' ');
}

/** Dónde está cada columna en la hoja REAL. `-1` si esa columna no existe. */
export function indicesDeEncabezado(encabezado: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  encabezado.forEach((c, i) => {
    const k = normalizarColumna(c);
    if (k && !(k in out)) out[k] = i;   // ante un nombre repetido, manda el primero
  });
  return out;
}

export interface DatosFila {
  /** DD/MM/YYYY. */
  fecha: string;
  /** Lo que Odoo dice, ya agrupado por tienda. */
  cruce: FilaCruce;
  /** Nombre de la tienda, para que la hoja se lea sin buscar el código. */
  nombre: string;
  /** Kilos pesados en Bodega, o `null` si todavía no se pesó. */
  kgBodega: number | null;
  /** Momento de la escritura, ISO. */
  actualizado: string;
}

const ETIQUETA: Record<string, string> = {
  comida: 'COMIDA', aseo: 'ASEO', hogar: 'HOGAR', chocolate: 'CHOCOLATE',
};

/**
 * Los valores de una fila, POR NOMBRE de columna.
 *
 * Los números van como NÚMERO, no como texto: en la celda tienen que poder sumarse.
 *
 * Cuando Bodega todavía no pesó, TOTAL BODEGA y % DIF quedan VACÍOS y no en cero. Un cero se lee
 * como "no vino nada", que es una afirmación distinta —y más grave— que "todavía no lo pesamos".
 */
export function valoresDeFila(d: DatosFila): Record<string, string | number> {
  const v: Record<string, string | number> = {
    'FECHA': d.fecha,
    'CÓDIGO': d.cruce.codigo,
    'TIENDA': d.nombre,
    'TOTAL ODOO': redondear(d.cruce.totalOdoo),
    'ACTUALIZADO': d.actualizado,
  };

  for (const t of TIPOS_CRUCE) {
    v[`REF ${ETIQUETA[t]}`] = refsParaCelda(d.cruce.refs[t]);
    v[`KG ${ETIQUETA[t]}`] = redondear(d.cruce.kg[t]);
  }

  // CERO ES "SIN PESAR", no "no vino nada". El 29/09 había 115 filas registradas con peso 0
  // —registradas temprano, pesadas después— y escribirlas como 0 daba «−100%» en toda la hoja,
  // que se lee como si no hubiera llegado nada. Es la misma regla que `esSinPesar` usa en el resto
  // del sistema: `!peso || peso <= 0`.
  const sinPesar = d.kgBodega === null || d.kgBodega === undefined || d.kgBodega <= 0;
  v['TOTAL BODEGA'] = sinPesar ? '' : redondear(d.kgBodega as number);
  const pct = sinPesar ? null : pctDiferencia(d.kgBodega as number, d.cruce.totalOdoo);
  v['% DIF'] = pct === null ? '' : Math.round(pct * 10) / 10;

  return v;
}

/**
 * Coloca los valores en el orden que tenga la hoja HOY.
 *
 * `filaPrevia` es la fila que ya estaba, cuando se actualiza: sus celdas se conservan y solo se
 * pisan las columnas que el sistema conoce. Así, una columna agregada a mano —una nota, un
 * responsable— sobrevive a cada registro en vez de borrarse sola.
 *
 * Una columna del sistema que no exista en la hoja simplemente no se escribe: es preferible a
 * desplazar todo lo demás para hacerle lugar.
 */
export function aFilaPosicional(
  valores: Record<string, string | number>,
  encabezado: string[],
  filaPrevia: (string | number)[] = [],
): (string | number)[] {
  const idx = indicesDeEncabezado(encabezado);
  const fila: (string | number)[] = [];
  for (let i = 0; i < encabezado.length; i++) fila[i] = filaPrevia[i] ?? '';

  for (const [nombre, valor] of Object.entries(valores)) {
    const i = idx[normalizarColumna(nombre)];
    if (i === undefined) continue;
    fila[i] = valor;
  }
  return fila;
}

/**
 * La llave de una fila ya escrita, para decidir si se actualiza o se agrega.
 *
 * Es lo que hace que registrar una tienda sola y después el día completo NO la duplique.
 */
export function llaveDeFila(fecha: string, codigo: string): string {
  return `${String(fecha ?? '').trim()}::${String(codigo ?? '').trim().toUpperCase()}`;
}

/** Dos decimales, que es como se pesa. Sin `toFixed`: eso devuelve texto y la celda dejaría de sumar. */
function redondear(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
