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
// Renombrar una columna del sistema tampoco rompe ya, si el nombre nuevo está en `ALIAS_COLUMNA`.
// Pasó el 30/09: alguien renombró TOTAL BODEGA a «TOTAL Fisico», que describe mejor lo que hay
// adentro. Sin alias, la siguiente escritura habría AGREGADO una columna TOTAL BODEGA vacía al
// final y «TOTAL Fisico» se habría quedado congelada con los datos de esa noche, sin que nadie lo
// notara hasta comparar dos filas a mano. El nombre se compara sin acentos ni mayúsculas, para que
// «CODIGO» y «Código» sigan calzando.
//
// El precedente en este repositorio son ENTREGA/TIENDA y RECEPCIÓN/TIENDA, por nombre desde #212.
//
// ── % DIF SE ESCRIBE COMO FÓRMULA ──────────────────────────────────────────────────────────────
//
// La columna llevaba un número calculado acá. En la hoja le pusieron a mano `=(E2-D2)/D2` y la
// arrastraron hasta abajo, que es lo correcto: así el porcentaje sigue vivo si alguien corrige un
// peso en la celda, y la celda con formato de porcentaje muestra la fracción como corresponde
// (el número que escribía el sistema, `-16,2`, en una celda con ese formato se vería «-1620%»).
//
// El problema es que la siguiente escritura la habría pisado con el número otra vez. Así que ahora
// la fórmula la escribe el sistema — con las LETRAS que esas dos columnas tengan hoy en la hoja,
// no con una E y una D fijas, porque acá las columnas se pueden mover de lugar.

import { TIPOS_CRUCE, refsParaCelda, pctDiferencia, kgDiferencia, type FilaCruce } from './cruceDePesos';

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
  // ── DOS COLUMNAS, PORQUE SON DOS PREGUNTAS ──────────────────────────────────────────────────
  //
  // `TOTAL BODEGA` —que en la hoja se llama «TOTAL Fisico»— contesta **¿ya se mandó?**: sale de
  // `despacho_rm` / `despacho_regiones`, que se llenan cuando alguien aprieta REGISTRAR.
  //
  // `TOTAL PESADO` contesta **¿cuánto marcó la balanza?**: sale de `picking_pallets`, y existe
  // desde el momento en que se pesa.
  //
  // Una sola columna no puede contestar las dos, y el 02/10/2026 eso costó dos correcciones de la
  // planilla en un día, en direcciones opuestas: primero se llenó «Fisico» con la balanza y
  // aparecieron 18 tiendas con peso sin que nadie las hubiera registrado; después se devolvió a lo
  // registrado y 26ALC quedó vacía aunque tenía 194,7 kg en la balanza. Las dos veces el número
  // era real; lo que estaba mal era que la celda significara dos cosas.
  //
  // Con las dos columnas la hoja dice la verdad completa de un vistazo:
  //
  //     PESADO con número + REGISTRADO vacío  →  «se pesó, falta apretar REGISTRAR»
  //     los dos vacíos                        →  carga que nadie tocó  (la alarma de verdad)
  //     los dos con número y distintos        →  se registró con una foto vieja del estado
  //
  // Hoy, para saber lo primero, hay que entrar a Bodega a mirar. Medido el 02/10: 11.531 kg
  // pesados en 18 tiendas que la planilla no tenía forma de mostrar.
  //
  // `% DIF` y `KG DIF` NO cambian: siguen comparando lo REGISTRADO contra Odoo. Cambiar qué
  // compara el indicador que mira Jefatura es una decisión suya, no un efecto secundario de
  // agregar una columna.
  'TOTAL PESADO',
  'TOTAL BODEGA',
  // Los kilos de diferencia, al lado del porcentaje: responden cosas distintas y las dos hacen
  // falta. Un −53,8% no dice si faltan 400 kg o 4.
  'KG DIF',
  '% DIF',
  'ACTUALIZADO',
  // ── ¿ESTABA PLANIFICADA? ────────────────────────────────────────────────────────────────────
  //
  // El 07/10/2026 apareció 38SP2 en el cruce y la primera pregunta fue «si no estaba en el
  // calendario de hoy, ¿por qué está acá?». El calendario NO filtra el cruce, y es a propósito:
  // el calendario es el PLAN y Odoo es el HECHO, así que filtrar los hechos por el plan esconde
  // en silencio justo lo que más importa ver — una tienda a la que el CD despachó SIN estar
  // planificada. Lo que corresponde es marcarla, y que la fila diga por qué está ahí.
  //
  // «No» significa «no estaba en la rutina semanal ni entre los adelantos». NO significa «nadie
  // la agregó nunca»: Bodega deja sumar tiendas a un día puntual desde el dispositivo, y eso el
  // servidor no lo ve. Ver `calendarioDelDia.ts`.
  'EN CALENDARIO',
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

/**
 * Nombres que la gente le puso a una columna del sistema y que también valen.
 *
 * La llave va ya normalizada (sin acentos, en mayúsculas), así que «TOTAL Físico» entra por la
 * misma puerta que «TOTAL FISICO».
 */
export const ALIAS_COLUMNA: Record<string, string> = {
  'TOTAL FISICO': 'TOTAL BODEGA',
  // Para que renombrar «TOTAL Fisico» a «TOTAL REGISTRADO» en la hoja sea una decisión de una
  // sola celda y no un cambio de código. Es el nombre que de verdad describe lo que hay adentro:
  // «físico» promete la balanza y lo que carga es lo que se mandó. Ver `ENCABEZADO_CRUCE`.
  'TOTAL REGISTRADO': 'TOTAL BODEGA',
};

/**
 * Dónde está cada columna del sistema en la hoja REAL, resolviendo los alias.
 *
 * Si la hoja tuviera el nombre nuevo Y el viejo, manda el que aparezca primero — misma regla que
 * para un nombre repetido.
 */
export function indicesDeEncabezado(encabezado: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  encabezado.forEach((c, i) => {
    const bruto = normalizarColumna(c);
    if (!bruto) return;
    const k = ALIAS_COLUMNA[bruto] ?? bruto;
    if (!(k in out)) out[k] = i;   // ante un nombre repetido, manda el primero
  });
  return out;
}

/** `A`, `B`, … `Z`, `AA`. La letra de una columna de Sheets a partir de su índice 0-based. */
export function letraDeColumna(indice: number): string {
  if (!Number.isInteger(indice) || indice < 0) return '';
  let n = indice, letra = '';
  do {
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letra;
}

/**
 * La primera fila de un rango como el que devuelve `append`: `'CRUCE PESOS'!A60:P62` → `60`.
 *
 * Se lee del rango y NO se calcula sumando al largo de la hoja: la planilla tenía filas al final
 * con la fórmula arrastrada y ningún dato, así que «la última fila» depende de a qué se le llame
 * dato — y si la cuenta se corre una fila, la fórmula queda apuntando a la de al lado.
 */
export function primeraFilaDe(rango?: string | null): number | null {
  const m = /![A-Z]+(\d+)/.exec(String(rango ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 2 ? n : null;
}

/**
 * La fórmula de `% DIF` para UNA fila, con las letras que TOTAL BODEGA y TOTAL ODOO tengan hoy.
 *
 * Es la misma que pusieron a mano en la hoja: `=(E2-D2)/D2`. Se arma con las letras reales porque
 * esta hoja se escribe por nombre y las columnas se pueden mover; dejar la E y la D fijas
 * significaría que el día que alguien corra una columna, el porcentaje pasa a calcular otra cosa.
 *
 * Sin separadores de argumentos a propósito: una fórmula con `,` o `;` depende del idioma de la
 * planilla, y esta no tiene ninguno.
 *
 * Devuelve `null` si falta alguna de las dos columnas o la fila no es válida; quien llama escribe
 * entonces el número, como antes.
 */
export function formulaPctDif(encabezado: string[], filaExcel: number): string | null {
  if (!Number.isInteger(filaExcel) || filaExcel < 2) return null;
  const idx = indicesDeEncabezado(encabezado);
  const iOdoo = idx[normalizarColumna('TOTAL ODOO')];
  const iBodega = idx[normalizarColumna('TOTAL BODEGA')];
  if (iOdoo === undefined || iBodega === undefined) return null;
  const bodega = `${letraDeColumna(iBodega)}${filaExcel}`;
  const odoo = `${letraDeColumna(iOdoo)}${filaExcel}`;
  return `=(${bodega}-${odoo})/${odoo}`;
}

export interface DatosFila {
  /** DD/MM/YYYY. */
  fecha: string;
  /** Lo que Odoo dice, ya agrupado por tienda. */
  cruce: FilaCruce;
  /** Nombre de la tienda, para que la hoja se lea sin buscar el código. */
  nombre: string;
  /** Kilos REGISTRADOS (lo que se mandó al apretar REGISTRAR), o `null` si no hay ninguno. */
  kgBodega: number | null;
  /** Kilos que marcó LA BALANZA, de `picking_pallets`. `null` si esa tienda no tiene nada pesado. */
  kgPesado?: number | null;
  /** Momento de la escritura, ISO. */
  actualizado: string;
  /** 'Sí' | 'No' | '' — si la tienda estaba en el calendario de ese día. Ver `ENCABEZADO_CRUCE`. */
  enCalendario?: string;
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
    // Vacío cuando no se pudo leer el calendario: un «No» en todas las filas sería una
    // afirmación que nadie verificó. Ver `calendarioDelDia.ts`.
    'EN CALENDARIO': d.enCalendario ?? '',
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
  // Misma regla para la balanza: vacío y no 0. Un 0 acá diría "se puso en la balanza y no pesó
  // nada", que es otra afirmación. Vacío dice "no hay nada pesado de esta tienda", que es la
  // verdad cuando el día recién empieza.
  const nadaPesado = d.kgPesado === null || d.kgPesado === undefined || d.kgPesado <= 0;
  v['TOTAL PESADO'] = nadaPesado ? '' : redondear(d.kgPesado as number);
  const pct = sinPesar ? null : pctDiferencia(d.kgBodega as number, d.cruce.totalOdoo);
  v['% DIF'] = pct === null ? '' : Math.round(pct * 10) / 10;
  // Sin pesar queda VACÍO, igual que el porcentaje: un "−606" acá se leería como que faltan 606
  // kilos, cuando lo que pasa es que todavía nadie pesó.
  v['KG DIF'] = sinPesar ? '' : redondear(kgDiferencia(d.kgBodega as number, d.cruce.totalOdoo));

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
 *
 * `filaExcel` es el número de fila REAL en la planilla (1-based, con el encabezado en la 1). Si se
 * pasa, `% DIF` se escribe como FÓRMULA en vez de como número — ver la cabecera. Sin pesar sigue
 * quedando VACÍO: la fórmula sobre una celda vacía daría −100%, que se lee como «no vino nada».
 */
export function aFilaPosicional(
  valores: Record<string, string | number>,
  encabezado: string[],
  filaPrevia: (string | number)[] = [],
  filaExcel?: number,
): (string | number)[] {
  const idx = indicesDeEncabezado(encabezado);
  const fila: (string | number)[] = [];
  for (let i = 0; i < encabezado.length; i++) fila[i] = filaPrevia[i] ?? '';

  for (const [nombre, valor] of Object.entries(valores)) {
    const i = idx[normalizarColumna(nombre)];
    if (i === undefined) continue;
    fila[i] = valor;
  }

  const iPct = idx[normalizarColumna('% DIF')];
  if (iPct !== undefined && filaExcel !== undefined && fila[iPct] !== '') {
    const f = formulaPctDif(encabezado, filaExcel);
    if (f) fila[iPct] = f;
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
