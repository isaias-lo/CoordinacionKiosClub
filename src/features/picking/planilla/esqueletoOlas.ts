// Armar el bloque de un día en la hoja PICKING de «Abastecimiento por Olas». Módulo puro.
//
// ── POR QUÉ AHORA SÍ SE CREAN FILAS ───────────────────────────────────────────────────────────
//
// `registroOlas.ts` deliberadamente NO crea filas: llena la F y la S de un esqueleto que alguien
// armó antes del turno. Eso valía mientras una persona lo precargara. Dejó de valer el 06/11/2026,
// cuando se limpiaron los días duplicados y se decidió que de ahí en adelante el esqueleto lo
// arma el sistema. Sin esto, desde el miércoles 11/11 el botón no tendría dónde escribir.
//
// El riesgo que motivó aquella decisión sigue vivo y se cubre de otra forma: **antes de crear se
// busca el día**. Si ya existe se rellena y no se crea nada. Duplicar un día no daría error —el
// `XLOOKUP` del bono se queda con la primera coincidencia— daría un número mal, que es peor.
//
// ── LA FORMA DEL BLOQUE, MEDIDA EN LA HOJA ────────────────────────────────────────────────────
//
// Tres filas por tienda, y el código de tienda SOLO en la primera de cada grupo:
//
//     A            B        C
//     06/11/2026   51SER    COMIDA
//     06/11/2026            ASEO            ← B vacía a propósito
//     06/11/2026            HOGAR
//     06/11/2026   39PSB    COMIDA
//     …
//     06/11/2026            CHOCOLATES      ← al final, sin tienda: son del día entero
//     06/11/2026            CONGELADOS
//
// Las secciones se escriben con la grafía que la hoja ya usa, **espacio final de «ASEO »
// incluido**. El calce es por texto normalizado, así que limpiarlo no rompería nada acá; pero no
// se sabe qué tablas dinámicas o filtros de esa planilla comparan la columna C en crudo, y es el
// mismo criterio que con `nombre_olas`: reproducir lo que hay, no mejorarlo de prepo.
//
// ── EL COLOR ALTERNA MIRANDO AL DÍA ANTERIOR ──────────────────────────────────────────────────
//
// Cada día va en cian o amarillo, alternados, para separarlos de un vistazo. La regla NO es por
// número par o impar de la fecha: eso se rompe al cambiar de mes, donde el 31 y el 1 son los dos
// impares y saldrían dos días del mismo color seguidos. La regla es la que usa una persona:
// mirar de qué color es el día de arriba y poner el otro.

import { SECCIONES, type MovimientoPlanilla } from './armarPlanilla';

/** Los dos colores que la hoja alterna, leídos de ella el 06/11/2026. */
export const CIAN = '#00FFFF';
export const AMARILLO = '#FFFF00';

/** La grafía EXACTA de cada sección en la columna C. Ver la cabecera sobre el espacio final. */
export const SECCION_EN_HOJA: Record<string, string> = {
  Comida: 'COMIDA',
  Aseo: 'ASEO ',
  Hogar: 'HOGAR',
  Chocolates: 'CHOCOLATES',
};

/** Las tres secciones que llevan una fila por tienda. Chocolates va aparte, por persona. */
const POR_TIENDA = ['Comida', 'Aseo', 'Hogar'] as const;

/** Cuántas filas de CONGELADOS se dejan en blanco al final de cada día.
 *
 *  **Dos, SIEMPRE — y el número no es del formato: es la gente.** Congelados lo hacen dos
 *  personas, que se reparten TODAS las tiendas del calendario de ese día según quién vino. Por
 *  eso van dos filas y no una por tienda: la unidad no es la tienda, es la persona.
 *
 *  Hasta el 09/11/2026 acá decía «dos, que es lo que la hoja viene teniendo». Eso describía la
 *  hoja sin explicarla, y dejaba la puerta abierta a «mejorarlo» haciendo que el número siguiera
 *  la asistencia. **No hay que hacerlo.** Confirmado por el coordinador y comprobado contra la
 *  hoja el 09/11/2026, 17 días seguidos del 19/10 al 10/11:
 *
 *      17 de 17 días → 2 filas de CONGELADOS
 *      26/10 y 05/11 → 2 filas, UN solo nombre (faltó uno de los dos)
 *
 *  Cuando falta uno se dejan igual los dos recuadros y se completa un nombre. El recuadro vacío
 *  es el registro de que ese día fue uno solo; quitarlo perdería ese dato.
 *
 *  Van en blanco porque esta planilla no registra congelados —viven en otra pestaña de Picking,
 *  y `desdeOdoo.ts` los excluye a propósito—, así que las completa una persona. No crearlas
 *  obligaría a insertar filas al medio después, que es peor.
 *
 *  **Qué se completa a mano, medido en la hoja esos mismos 17 días:** la columna F lleva el
 *  nombre de la persona y la S siempre «Mario Patiño», que es la cuenta de Odoo con la que se
 *  hace TODO el congelado. Cuando falta uno, su fila queda entera en blanco: ni nombre ni
 *  cuenta. Así que la S vacía que deja este esqueleto no es un olvido — es lo que una persona
 *  llena, igual que el nombre. */
const FILAS_CONGELADOS = 2;

/** Una fila del bloque a crear. */
export interface FilaNueva {
  /** Columna B. Vacía en todas menos la primera de cada grupo de tienda. */
  tienda: string;
  /** Columna C, con la grafía exacta de la hoja. */
  seccion: string;
}

/**
 * El color que le toca a un día, mirando el del día anterior.
 *
 * Sin color anterior —el primer día de la hoja, o una lectura que falló— arranca en cian, que es
 * el que la hoja venía usando para los días impares. Es una convención, no un dato: lo que
 * importa es que dos días seguidos nunca compartan color.
 */
export function colorAlternado(anterior: string | null | undefined): string {
  if (!anterior) return CIAN;
  return anterior.toUpperCase() === AMARILLO ? CIAN : AMARILLO;
}

/**
 * Las filas del bloque de un día.
 *
 * `cods` son las tiendas del día **en el orden del calendario**, que es el mismo que la planilla
 * muestra. `movimientos` sirve solo para saber cuántas personas hicieron chocolates: en la hoja
 * esa sección es una fila por persona y no una por tienda.
 *
 * Siempre se crean las tres filas de cada tienda, tenga carga o no. Una tienda del día sin fila
 * no se puede llenar después sin insertar en el medio, y en la hoja de hoy las tiendas sin carga
 * están igual, con sus tres filas vacías.
 */
export function filasEsqueleto(cods: string[], movimientos: MovimientoPlanilla[]): FilaNueva[] {
  const filas: FilaNueva[] = [];

  const vistas = new Set<string>();
  for (const cod of cods) {
    if (vistas.has(cod)) continue;   // el calendario puede repetir un adelanto
    vistas.add(cod);
    POR_TIENDA.forEach((s, i) => {
      filas.push({ tienda: i === 0 ? cod : '', seccion: SECCION_EN_HOJA[s] });
    });
  }

  // Chocolates: una fila por persona distinta del día. Si nadie hizo, igual va una, para que la
  // fila exista y se pueda completar a mano.
  const personas = new Set<string>();
  for (const m of movimientos) {
    if (m.seccion !== 'Chocolates') continue;
    if (m.estado !== 'done' && m.estado !== 'assigned') continue;
    const p = (m.picker ?? '').trim();
    if (p) personas.add(p);
  }
  const cuantosChoc = Math.max(1, personas.size);
  for (let i = 0; i < cuantosChoc; i++) {
    filas.push({ tienda: '', seccion: SECCION_EN_HOJA.Chocolates });
  }

  for (let i = 0; i < FILAS_CONGELADOS; i++) {
    filas.push({ tienda: '', seccion: 'CONGELADOS' });
  }

  return filas;
}

/**
 * Las tres fórmulas de una fila, con su número ya puesto.
 *
 * Son las que la hoja tiene en todas sus filas y de las que cuelga el cruce del bono. Crear una
 * fila sin ellas dejaría ese día fuera del cálculo sin ningún error visible:
 *
 * - **T** `=CONCATENATE(A;S)` — la llave con que `Tiempo Picking` busca el nombre de la persona.
 * - **U** mira la fila de ARRIBA cuando la tienda está en blanco, que es como arrastra el código
 *   por el grupo. Por eso `filaAnterior` importa: en la primera fila del bloque apunta a la
 *   última del bloque previo, igual que en el resto de la hoja.
 * - **X** `=W-V`, la duración.
 */
export function formulasDe(fila: number): { T: string; U: string; X: string } {
  return {
    T: `=CONCATENATE(A${fila};S${fila})`,
    U: `=IF($A${fila}="";"";IF($B${fila}<>"";REGEXREPLACE($B${fila};"^\\d+";"");U${fila - 1}))`,
    X: `=W${fila}-V${fila}`,
  };
}

/** Un resumen en palabras de lo que se va a crear, para el cuadro de confirmación. */
export function describirEsqueleto(filas: FilaNueva[]): string {
  const tiendas = filas.filter(f => f.tienda).length;
  const choc = filas.filter(f => f.seccion === SECCION_EN_HOJA.Chocolates).length;
  const cong = filas.filter(f => f.seccion === 'CONGELADOS').length;
  return `${filas.length} filas: ${tiendas} ${tiendas === 1 ? 'tienda' : 'tiendas'} × 3 secciones, ` +
         `${choc} de chocolates y ${cong} de congelados en blanco`;
}

/** Las secciones que esta hoja conoce, normalizadas. Útil para avisar de una desconocida. */
export const SECCIONES_CONOCIDAS = [...SECCIONES.map(s => SECCION_EN_HOJA[s]), 'CONGELADOS'];
