// Cuándo SALE lo que se armó un día. Puro y testeable.
//
// La regla la dio el coordinador y no está escrita en ninguna parte del sistema:
//
//   "se trabaja con despacho el día siguiente hábil de trabajo, es decir, lo que se arma el lunes
//    en congelados se despacha al día siguiente es decir el martes, pero el día viernes, lo que se
//    arma este día, se despacha recién el día lunes"
//
// Congelados va con flota interna, que no trabaja fin de semana. Seco es otra cosa: lo del viernes
// sale el sábado porque lo mueve una empresa externa. Por eso esta función es de congelados y no
// del despacho en general.
//
// Importa porque el calendario de congelados marca el día de ARMADO, y todo el resto del sistema
// (ruta, manifiesto, Enrutador) razona sobre el día de SALIDA. Sin traducir entre los dos, el
// sábado no hay forma de rutear lo del viernes.

/** Los feriados no están modelados todavía: solo se salta sábado y domingo. */
function esFinDeSemana(d: Date): boolean {
  const n = d.getUTCDay();
  return n === 0 || n === 6;
}

/**
 * El día hábil siguiente al de armado. `armadoISO` en YYYY-MM-DD; devuelve YYYY-MM-DD.
 *
 * Se calcula en UTC a propósito: son fechas civiles sin hora, y sumar días sobre una fecha local
 * se rompe en los cambios de horario de verano (Chile los tiene).
 */
export function diaDespachoCongelados(armadoISO: string): string {
  const d = new Date(`${armadoISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return armadoISO;
  do { d.setUTCDate(d.getUTCDate() + 1); } while (esFinDeSemana(d));
  return d.toISOString().slice(0, 10);
}

/** Cuántos días hay entre el armado y la salida: 1 de lunes a jueves, 3 el viernes. */
export function diasHastaDespacho(armadoISO: string): number {
  const a = new Date(`${armadoISO}T00:00:00Z`).getTime();
  const b = new Date(`${diaDespachoCongelados(armadoISO)}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}
