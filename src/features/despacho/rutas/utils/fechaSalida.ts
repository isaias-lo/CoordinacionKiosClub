// Traducir entre el día en que se ARMA y el día en que SALE. Puro y testeable.
//
// La fecha de la cabecera del Enrutador siempre fue la del ARMADO, no la de la salida: una ruta
// creada el 11/09 se llama RUTA-110926 y sale el 12. Pero el único rótulo que existía —y solo en
// celular— decía "Fecha de salida". Decía lo contrario de lo que hace.
//
// Y no hay una sola regla de salida, hay dos:
//
//   SECO        sale al día siguiente. Lo del viernes sale el sábado, porque lo mueve una
//               empresa externa que sí trabaja ese día.
//   CONGELADOS  va con flota interna, que no trabaja fin de semana: lo del viernes sale recién
//               el lunes (ver ./../../congelados/utils/diaDespachoCongelados).
//
// Por eso la salida depende de la pestaña que estés mirando.

import { diaDespachoCongelados } from '../../congelados/utils/diaDespachoCongelados';

export type TipoCarga = 'seco' | 'congelados';

/** Suma un día a una fecha ISO. En UTC: son fechas civiles y Chile tiene horario de verano. */
function masUnDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** El día en que sale lo armado en `armadoISO`. */
export function fechaSalida(armadoISO: string, tipo: TipoCarga): string {
  if (!armadoISO) return armadoISO;
  // Seco: día siguiente, fin de semana incluido. La empresa externa trabaja el sábado.
  return tipo === 'congelados' ? diaDespachoCongelados(armadoISO) : masUnDia(armadoISO);
}

/**
 * El último día hábil ANTERIOR a `hoyISO` (o el mismo día si ya es hábil y `incluirHoy`).
 *
 * Existe para el fin de semana: la ruta de congelados del lunes se arma el sábado o el domingo,
 * y el día que hay que abrir es el viernes. Un botón "Ayer" no sirve — desde el domingo, ayer es
 * el sábado, que no tiene carga.
 */
export function ultimoDiaHabil(hoyISO: string, incluirHoy = false): string {
  const d = new Date(`${hoyISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return hoyISO;
  const esHabil = (x: Date) => x.getUTCDay() !== 0 && x.getUTCDay() !== 6;
  if (incluirHoy && esHabil(d)) return hoyISO;
  do { d.setUTCDate(d.getUTCDate() - 1); } while (!esHabil(d));
  return d.toISOString().slice(0, 10);
}

/** true cuando `hoyISO` cae sábado o domingo. */
export function esFinDeSemana(hoyISO: string): boolean {
  const n = new Date(`${hoyISO}T00:00:00Z`).getUTCDay();
  return n === 0 || n === 6;
}
