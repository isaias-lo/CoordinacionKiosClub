// Qué día de Odoo mira una petición de Picking. PURO.
//
// ── EL CASO DEL 31/10/2026 ────────────────────────────────────────────────────────────────────
//
// Sábado, sin tiendas de calendario, con gente en horas extra para sacar la apertura de 62PLD.
// Sus 16 movimientos existían en Odoo, Preparados, y la tienda entró VACÍA: están fechados el
// viernes 30 y la consulta pide un solo día, el de hoy.
//
// Las aperturas las carga Abastecimiento con días de anticipación, así que su fecha prevista casi
// nunca es el día en que se arman. 63CAL llegó a tener tres lotes repartidos entre el 27 y el 28.
//
// ── POR QUÉ EL DÍA LO DICE EL CLIENTE Y NO EL SERVIDOR ────────────────────────────────────────
//
// `/api/odoo` resolvía el día con `localDateStr(new Date())` — el reloj del SERVIDOR. Eso dejaba
// dos cosas afuera: la apertura, y el día de trabajo del #734, que viaja en `?dia=` y nunca
// llegaba hasta acá. Una pantalla podía estar mostrando el martes 13 y pedirle a Odoo el día de
// hoy sin que nada avisara.
//
// ── POR QUÉ IGUAL SE VALIDA ───────────────────────────────────────────────────────────────────
//
// Lo que manda un cliente no se cree: se comprueba. La misma ventana del día de trabajo —hoy, o
// hasta `MAX_DIAS_ATRAS` hacia atrás, el futuro NUNCA— porque es la misma pregunta («¿qué día se
// puede estar trabajando?») y tener dos respuestas distintas para eso es cómo se fabrica un bug.
// Un día que no pasa el control no es un error: cae en hoy, que es lo que hacía antes.

// ── POR QUÉ `cruce_pesos_dia` NO USA ESTO, Y NO ES UN OLVIDO ──────────────────────────────────
//
// Esa acción valida solo el FORMATO de la fecha, sin ventana, y tiene que seguir así: el cargador
// de días pasados (`scripts/cargar-cruce-pesos.mts`) recarga días muy viejos —el 12/10 se recargó
// el 31, diecinueve días después— y la ventana de siete lo dejaría sin poder hacerlo.
//
// Son dos preguntas distintas: «¿qué día se puede estar TRABAJANDO?» (acotada, porque de ahí sale
// carga que se escribe) y «¿qué día quiero MIRAR?» (abierta, porque solo lee). Unificarlas por
// parecerse rompería el cargador.

import { resolverDiaDeTrabajo, MAX_DIAS_ATRAS } from './diaDeTrabajo';

/** Lo poco que se le pide al cuerpo de la petición. */
export interface PeticionConDia {
  fecha?: unknown;
}

/**
 * El día que la consulta a Odoo va a mirar.
 *
 * Sin `fecha`, o con una que no pasa el control, devuelve hoy — o sea, exactamente lo que hacía
 * antes de que esto existiera. Así una pantalla vieja que no manda nada sigue funcionando igual.
 */
export function diaParaConsultarOdoo(
  body: PeticionConDia | null | undefined,
  hoy: string,
  maxAtras = MAX_DIAS_ATRAS,
): string {
  const pedida = body?.fecha;
  if (typeof pedida !== 'string') return hoy;
  return resolverDiaDeTrabajo(pedida, hoy, maxAtras);
}

/** `true` si la petición pide un día que NO es hoy. Para no cachear de más ni medir mal. */
export function pideOtroDia(
  body: PeticionConDia | null | undefined,
  hoy: string,
  maxAtras = MAX_DIAS_ATRAS,
): boolean {
  return diaParaConsultarOdoo(body, hoy, maxAtras) !== hoy;
}
