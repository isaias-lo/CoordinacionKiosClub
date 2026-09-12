// Fechas escritas para leer, no para comparar. Puro y testeable.
//
// Existe por m-01: Inicio mostraba "Viernes 11 De Septiembre, 2026" — capitalización por palabra
// sobre una fecha en español, que además no lleva coma antes del año. En español va "viernes 11 de
// septiembre de 2026", y con mayúscula solo si abre la frase.
//
// La zona es fija (America/Santiago), igual que `fechaChile`: la fecha que se muestra tiene que ser
// la del CD, no la del reloj del equipo — y en el servidor ese reloj es UTC (ver lib/fechaChile.ts).

const TZ = 'America/Santiago';

const LARGA = new Intl.DateTimeFormat('es-CL', {
  timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

/** Mayúscula solo en la primera letra. `capitalize` de CSS la pone en CADA palabra. */
export function conMayusculaInicial(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/**
 * `viernes 11 de septiembre de 2026`. En minúscula: quien la muestre decide si va capitalizada.
 *
 * `es-CL` intercala una coma tras el día de la semana ("viernes, 11 de…") que en una fecha suelta
 * sobra; se quita.
 */
export function fechaLargaCL(fecha: Date | string | number = new Date()): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return LARGA.format(d).replace(',', '');
}
