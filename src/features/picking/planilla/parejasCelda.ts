// Quién hizo cada celda tienda × sección, como pares (persona, cuenta). Módulo puro.
//
// ── POR QUÉ UNA CELDA PUEDE TENER MÁS DE UNA FILA ────────────────────────────────────────────
//
// Hasta el 21/11/2026 cada tienda tenía tres filas fijas —Comida, Aseo, Hogar— y cada una admitía
// un solo nombre. Cuando dos personas hacían la misma sección de la misma tienda, el registro no
// podía elegir y dejaba la celda a mano. Caso real: 62PLD, miércoles 18/11/2026, la Comida la
// hicieron `Pickers 7` (Marcelo Vergara) y `Adquisiciones` (Sebasthian Cortez); la hoja quedó con
// una sola fila de COMIDA y con un solo nombre.
//
// Desde el 21/11/2026 la sección lleva **una fila por cada par persona-cuenta** que la hizo, igual
// que chocolates ya lleva una por persona. Lo aprobó el coordinador el 20/11/2026 sobre un mockup
// con ese caso. Medido sobre noviembre antes de decidir:
//
//     celdas tienda × sección .......... 1.103
//     con una sola persona ............. 1.090   98,8%
//     con 2 · 3 · 5 personas ........... 11 · 1 · 1
//     filas de más en todo el mes ...... 17      9 de 15 días, ninguna
//
// 7 de esos 13 casos son 62PLD, casi todos de «Abastecimiento Apertura», donde Odoo ya parte el
// trabajo en «Comida 5», «Comida 6»… El techo medido es 62PLD el 02/11/2026: Comida 2 cuentas,
// Aseo 2 y Hogar 5, así que esa tienda pasa de 3 filas a 9.
//
// ── POR QUÉ ESTE MÓDULO ES APARTE ─────────────────────────────────────────────────────────────
//
// La misma lista decide dos cosas en dos módulos distintos:
//
//     esqueletoOlas   cuántas filas lleva cada sección cuando se ARMA el bloque del día
//     registroOlas    qué par se ESCRIBE en cada una de esas filas
//
// Si cada uno calculara la suya, tarde o temprano dejarían de coincidir y el registro encontraría
// una fila de menos —o de más— para una celda, sin ningún error. Es el mismo tropiezo que ya pasó
// con las secciones que se llenan a mano: dos listas que tenían que ser una (ver
// `SECCIONES_A_MANO`).
//
// Y tiene que ser un módulo HOJA, que no importe de ninguno de los dos: `registroOlas` ya importa
// de `esqueletoOlas`, así que si esto viviera en `registroOlas` el esqueleto tendría que
// importarlo de vuelta. Un ciclo entre módulos con constantes de nivel superior revienta o no
// según cuál se cargue primero. Por eso `normalizar` también vive acá y `registroOlas` la
// reexporta.
//
// ── POR QUÉ EL PAR Y NO SOLO LA PERSONA ───────────────────────────────────────────────────────
//
// Una fila de la hoja ES un par: el nombre en F y la cuenta en S, y la cuenta es la llave con la
// que la hoja del bono busca el nombre (`PICKING!T = CONCATENATE(A; S)`). Si la misma persona usó
// dos cuentas en la misma celda y se le diera una sola fila, una de las dos cuentas no quedaría
// escrita en ninguna parte. Con el par, cada cuenta tiene su fila.
//
// Para el caso de siempre —una persona con una cuenta— el par y la persona son lo mismo.

import type { MovimientoPlanilla, SeccionPlanilla } from './armarPlanilla';

/**
 * Compara textos de la hoja con los de la app.
 *
 * Sin acentos, sin mayúsculas y sin espacios al borde: la columna C trae «ASEO » con espacio
 * final y los códigos pueden venir con Ñ en cualquier forma Unicode. Es la MISMA regla que usa
 * `flatCode` del catálogo, escrita acá sobre texto libre y no solo códigos.
 */
export function normalizar(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** Quién hizo una celda: una persona con una cuenta, y cuánto trabajo suma ese par ahí. */
export interface Pareja {
  persona: string;
  /** La cuenta de Odoo. `''` solo si todas las líneas de esa persona en la celda son a mano. */
  cuenta: string;
  /** La suma de los `registros` de sus movimientos en la celda. Es lo que ordena. */
  registros: number;
}

/** Un movimiento cuenta como trabajo de la celda si está hecho o asignado y tiene a alguien. */
export function esTrabajo(m: MovimientoPlanilla): boolean {
  return (m.estado === 'done' || m.estado === 'assigned') && (m.picker ?? '').trim() !== '';
}

/**
 * Los pares persona-cuenta que hicieron una sección de una tienda, del que más trabajó al que
 * menos.
 *
 * **Una línea agregada a mano no trae cuenta** (ver `conCorrecciones`): se suma al par de esa
 * misma persona en la celda si lo hay, y solo forma un par propio —con cuenta vacía— si es lo
 * único que esa persona tiene ahí. Si abriera un par aparte, una corrección a mano le inventaría
 * a la tienda una fila de más.
 *
 * El orden es por volumen y, a igual volumen, por nombre y cuenta: no depende del orden en que
 * llegaron los movimientos, que cambia de una consulta a otra. Es la misma regla que chocolates.
 */
export function parejasDeCelda(
  movimientos: readonly MovimientoPlanilla[], cod: string, seccion: SeccionPlanilla,
): Pareja[] {
  const objetivo = normalizar(cod);
  const deLaCelda = movimientos.filter(m =>
    m.seccion === seccion && normalizar(m.cod) === objetivo && esTrabajo(m));

  const porPar = new Map<string, Pareja>();
  const sinCuenta: MovimientoPlanilla[] = [];
  for (const m of deLaCelda) {
    const cuenta = (m.cuenta ?? '').trim();
    if (!cuenta) { sinCuenta.push(m); continue; }
    const persona = m.picker.trim();
    const k = `${persona}\u0000${cuenta}`;
    const p = porPar.get(k) ?? { persona, cuenta, registros: 0 };
    p.registros += Number(m.registros) || 0;
    porPar.set(k, p);
  }

  for (const m of sinCuenta) {
    const persona = m.picker.trim();
    const suyas = [...porPar.values()].filter(p => p.persona === persona);
    if (suyas.length > 0) {
      // Al par con más volumen de esa persona: es donde ya está la mayor parte de su trabajo.
      suyas.sort(porVolumen)[0].registros += Number(m.registros) || 0;
      continue;
    }
    const k = `${persona}\u0000`;
    const p = porPar.get(k) ?? { persona, cuenta: '', registros: 0 };
    p.registros += Number(m.registros) || 0;
    porPar.set(k, p);
  }

  return [...porPar.values()].sort(porVolumen);
}

function porVolumen(a: Pareja, b: Pareja): number {
  return b.registros - a.registros
    || a.persona.localeCompare(b.persona)
    || a.cuenta.localeCompare(b.cuenta);
}
