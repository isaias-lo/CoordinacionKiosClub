// Lo que dice la banda de APERTURA en la etiqueta del pallet. PURO.
//
// ── POR QUÉ LA ETIQUETA TIENE QUE DECIRLO ─────────────────────────────────────────────────────
//
// Una apertura se arma un día con movimientos de otro: 62PLD se armó el sábado 31 con los del
// viernes 30. El pallet sale con la fecha de hoy y los papeles de Odoo dicen otra, y quien lo
// recibe no tiene cómo saber que eso está bien. Sin esta línea, parece un error.
//
// ── POR QUÉ EL DÍA DE SEMANA Y NO SOLO LA FECHA ───────────────────────────────────────────────
//
// «30/10» obliga a calcular; «VIE 30/10» se entiende de una. En una bodega nadie va a mirar un
// calendario para saber de qué día le están hablando.
//
// El nombre del día sale de una lista fija y no de `toLocaleDateString`: la etiqueta se imprime
// desde cualquier equipo, y uno con el idioma en inglés habría impreso «FRI».

const DIAS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;

/**
 * `true` si la cadena es un día que EXISTE, no solo uno con la forma correcta.
 *
 * La forma no alcanza: `2026-13-45` la cumple, y `Date.UTC` lo rueda sin quejarse hasta otra
 * fecha — imprimía «DOM 45/13» en la etiqueta de un pallet. Se construye y se comprueba que los
 * tres números volvieron iguales.
 */
function esISO(dia: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return false;
  const [a, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * «VIE 30/10» — corto, porque entra en una banda junto al título.
 *
 * Cadena vacía si el día no se entiende: la banda entonces se dibuja sin fecha, en vez de
 * imprimir basura en algo que se pega a un pallet.
 */
export function rotuloDiaApertura(dia: string | null | undefined): string {
  const d = String(dia ?? '').trim();
  if (!esISO(d)) return '';
  const [a, m, dd] = d.split('-').map(Number);
  // `Date.UTC` + getUTCDay: el día de la semana no puede depender del huso del equipo que imprime.
  const nombre = DIAS[new Date(Date.UTC(a, m - 1, dd)).getUTCDay()];
  return `${nombre} ${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Lo que la banda muestra: el título fijo y, si se sabe, de qué día vienen los movimientos. */
export interface BandaApertura {
  titulo: string;
  /** El rótulo chico de arriba. Vacío cuando no hay día que mostrar. */
  rotulo: string;
  /** «VIE 30/10», o vacío. */
  dia: string;
}

/**
 * La banda de una etiqueta de apertura, o `null` si esta etiqueta no lo es.
 *
 * Devolver `null` y no una banda vacía es a propósito: quien dibuja pregunta una sola cosa —«¿hay
 * banda?»— en vez de tener que saber qué campos mirar para decidir si pintarla.
 */
export function bandaDeApertura(dia: string | null | undefined): BandaApertura | null {
  const d = String(dia ?? '').trim();
  if (!d) return null;
  const rotulado = rotuloDiaApertura(d);
  return {
    titulo: 'APERTURA',
    rotulo: rotulado ? 'Movimientos de' : '',
    dia: rotulado,
  };
}
