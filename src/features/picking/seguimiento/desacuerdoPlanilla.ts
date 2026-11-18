// Cuándo las horas de la pantalla dejan de coincidir con la hoja del bono, y qué número daría ella.
// Módulo puro.
//
// ── POR QUÉ HAY QUE MOSTRARLO ─────────────────────────────────────────────────────────────────
//
// Desde el #816 las horas se miden por RELOJ: cada tanda una vez y los lapsos que se pisan unidos.
// La hoja «Tiempo Picking» de la jefatura no une: su `Tiempo_R` des-duplica por tanda y después
// suma. En la mayoría de la gente las dos cuentas dan lo mismo, pero no en todos. Medido del 1 al
// 16/11/2026 sobre las 30 cuentas con trabajo:
//
//     24 cuentas ................ 1,07× o menos — la pantalla y la hoja coinciden
//     Supervisor Web ............ 1,15×
//     Pickers 6  · J. Mendoza ... 1,37×
//     Pickers 16 · C. Flores .... 1,97×
//     Pickers 13 · V. Conejera .. 2,49×   165,2 h en la hoja contra 66,3 de reloj
//     Pickers 11 · Diego Farr ... 3,11×   238,8 h contra 76,8
//     Mario Patiño .............. 9,49×   745,5 h contra 78,5 — 46,6 horas por día
//
// Si la pantalla cambiara el número y se quedara callada, el coordinador llegaría a una reunión
// con 76,8 h en la mano y la jefatura con 238,8 en la suya, sin que nadie pueda explicar de dónde
// sale la diferencia. Por eso el número de la hoja se muestra DEBAJO del de reloj en las filas
// donde se separan: es el dato que hace la conversación posible.
//
// ── EL UMBRAL, Y POR QUÉ NO SE MUESTRA SIEMPRE ────────────────────────────────────────────────
//
// Repetir el mismo número en las 24 filas que coinciden es ruido que esconde las 6 que importan.
// El umbral en 1,1 cae en el hueco que dejan los datos: la cuenta que más se acerca por abajo es
// 1,07 y la que menos por arriba, 1,15. No hay nada en el medio que pueda caer de un lado u otro
// por un minuto de diferencia.
//
// ── EL RITMO DE LA HOJA SE DERIVA, NO SE RECALCULA ────────────────────────────────────────────
//
// `cph` se calcula sobre las unidades MEDIDAS —las de las operaciones que tienen las dos horas—, y
// ese número no viaja en la fila. Así que el ritmo de la hoja sale de escalar el real:
//
//     cph          = unidadesMedidas / minutos
//     cphPlanilla  = unidadesMedidas / minutosSumados  =  cph × minutos / minutosSumados
//
// Es exacto y no necesita un dato que no está. Dividir `units` por `minutosSumados` daría otro
// número en cuanto alguien tenga una operación sin hora de asignación.

/** Lo mínimo para decidirlo. Lo cumple `PickerStatRow` desde el #816. */
export interface FilaConTiempo {
  /** Minutos de reloj: lo que muestra la pantalla. */
  totalMinutes: number;
  /** Los mismos lapsos sumados sin unir: lo que da la hoja del bono. */
  totalMinutesSumados?: number;
  /** Lapsos que se pisaron con otro. Es el porqué de la diferencia. */
  tandasSolapadas?: number;
  /** Unidades por hora, calculado sobre las horas de reloj. */
  cph: number;
}

export interface Desacuerdo {
  /** Los minutos que daría la hoja. */
  minutos: number;
  /** El ritmo que saldría de esos minutos. */
  cph: number;
  /** Cuántas veces más grandes son las horas de la hoja. */
  factor: number;
  /** Lapsos que se pisaron. */
  solapadas: number;
}

/** Por debajo de esto, la pantalla y la hoja dicen lo mismo. Ver la cabecera para la medición. */
export const UMBRAL_DESACUERDO = 1.1;

/**
 * El número de la hoja del bono para esta fila, o `null` si no hay desacuerdo que mostrar.
 *
 * Devuelve `null` en tres casos, y los tres tienen que quedar en `null`:
 *   · la fila viene de un cache anterior al #816 y no trae `totalMinutesSumados`;
 *   · las dos cuentas dan lo mismo (el 80% de la gente);
 *   · no hay horas medidas, así que no hay nada que comparar.
 */
export function desacuerdoConLaPlanilla(
  f: FilaConTiempo,
  umbral: number = UMBRAL_DESACUERDO,
): Desacuerdo | null {
  const reloj = Number(f.totalMinutes) || 0;
  const sumados = Number(f.totalMinutesSumados) || 0;
  if (reloj <= 0 || sumados <= 0) return null;

  const factor = sumados / reloj;
  if (!Number.isFinite(factor) || factor < umbral) return null;

  return {
    minutos: sumados,
    // Escalar el real en vez de recalcularlo. Ver la cabecera.
    cph: Math.round((Number(f.cph) || 0) * (reloj / sumados)),
    factor: Math.round(factor * 100) / 100,
    solapadas: Math.max(0, Number(f.tandasSolapadas) || 0),
  };
}

/** «la hoja del bono le cuenta 238,8 h porque suma 118 lapsos que se pisan». Para el `title`. */
export function explicacionDesacuerdo(d: Desacuerdo): string {
  const horas = (d.minutos / 60).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const veces = d.factor.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const porque = d.solapadas === 1
    ? 'porque suma 1 lapso que se pisa con otro'
    : `porque suma ${d.solapadas} lapsos que se pisan con otro`;
  return `La hoja del bono le cuenta ${horas} h —${veces} veces estas— ${porque}.`;
}
