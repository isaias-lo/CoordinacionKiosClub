// Qué es un backorder y cómo se lee en la hoja. Módulo puro: sin red ni UI.
//
// ── QUÉ PASA AL VALIDAR ───────────────────────────────────────────────────────────────────────
//
// Cuando el picker valida un movimiento, Odoo cierra lo que efectivamente se pickeó y manda el
// RESTO a un movimiento nuevo, con `backorder_id` apuntando al original:
//
//     99REC/DT/148618  done       4 registros
//     99REC/DT/148785  assigned   1 registro    backorder_de = 148618
//
// En la planilla ese movimiento nuevo cae en la MISMA celda que el original —misma tienda, misma
// sección— y sin picker, porque todavía no se le asignó a nadie. Se veía exactamente igual que un
// movimiento que nadie empezó, y eso se lee como trabajo olvidado cuando es lo contrario: es lo
// que quedó de un trabajo que YA se hizo.
//
// ── CUÁNTOS SON, MEDIDO ───────────────────────────────────────────────────────────────────────
//
// Medido el 05/11/2026 contra Odoo, tres días:
//
// | día   | movimientos | son backorder | entran a la hoja sin picker |
// |-------|-------------|---------------|-----------------------------|
// | 03/11 | 279         | 128           | 0                           |
// | 04/11 | 199         | 84            | 1                           |
// | 05/11 | 263         | 92            | 15                          |
//
// Son muchísimos, pero casi todos quedan fuera de la hoja por estado: `cancel` (121 el 03/11) y
// `confirmed` (27 el 05/11), que `armarPlanilla` ya descarta y cuenta al pie. Los 15 del 05/11 son
// los que estaban ensuciando la lectura.
//
// **Un backorder `assigned` NO es «sin stock».** `assigned` en Odoo significa reservado: ese resto
// tiene stock y se puede pickear. El que está esperando stock es `confirmed`, y ese no entra a la
// hoja. Por eso la etiqueta dice de dónde quedó y no inventa un motivo.
//
// ── EL ORIGINAL SIEMPRE ESTÁ EN LA MISMA RESPUESTA ────────────────────────────────────────────
//
// Medido los tres días: 100% de los backorders (92/92, 84/84, 128/128) tienen su original en el
// mismo día y con el mismo `origin`. Así que el número del original se resuelve del mismo payload,
// sin una segunda consulta a Odoo.
//
// El índice se arma sobre los movimientos CRUDOS, antes de descartar nada: el original suele estar
// `done`, pero puede estar `cancel`, y en ese caso no llega a la hoja. Armándolo después del
// descarte, la etiqueta quedaría sin su número justo en esos casos.

/** El movimiento del que quedó un backorder, ya resuelto. */
export interface OrigenBackorder {
  /** La referencia del original: `99REC/DT/148618`. */
  ref: string;
  /** Sus registros, o `null` si el original no vino en la respuesta. */
  registros: number | null;
}

/** Lo mínimo que hace falta para armar el índice. */
interface ConRef { ref: string; registros: number }

/**
 * `ref → registros` sobre los movimientos crudos.
 *
 * Se arma antes de descartar por estado, sección o día: ver el comentario de arriba.
 */
export function indiceRegistros(crudos: ConRef[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of crudos) if (c.ref) m.set(c.ref, c.registros);
  return m;
}

/**
 * De qué movimiento quedó este, con el número del original resuelto.
 *
 * `null` cuando no es un backorder. Si el original no está en el índice se devuelve igual, con
 * `registros: null`: que no se pueda decir de cuántos quedó no lo hace menos backorder, y callarlo
 * sería volver al problema de origen.
 */
export function resolverOrigen(
  backorderDe: string | null | undefined,
  indice: ReadonlyMap<string, number>,
): OrigenBackorder | null {
  if (!backorderDe) return null;
  const registros = indice.get(backorderDe);
  return { ref: backorderDe, registros: registros ?? null };
}

/**
 * El texto corto de la celda: «resto de 4».
 *
 * Va en la columna Usuario, que es angosta, así que no puede ser una frase. El porqué completo va
 * en el `title`, que es lo que da `tituloBackorder`.
 */
export function textoBackorder(o: OrigenBackorder): string {
  return o.registros === null ? 'resto de otro' : `resto de ${o.registros}`;
}

/** La explicación entera, para el `title` y para la ayuda. */
export function tituloBackorder(o: OrigenBackorder): string {
  const de = o.registros === null
    ? `del movimiento ${o.ref}, que ya se validó`
    : `del movimiento ${o.ref}, que ya se validó con ${o.registros} ${o.registros === 1 ? 'registro' : 'registros'}`;
  return `Es lo que quedó ${de}. No es un movimiento nuevo sin empezar: `
       + 'Odoo lo creó solo al validar, con lo que no se alcanzó a pickear.';
}

/** La marca compacta para el papel y el archivo: «↳4». En la hoja impresa no cabe más. */
export function marcaBackorder(o: OrigenBackorder): string {
  return o.registros === null ? '↳' : `↳${o.registros}`;
}
