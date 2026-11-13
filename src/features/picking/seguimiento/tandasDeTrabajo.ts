// Cuántas horas trabajó realmente una persona, sin contar dos veces la misma TANDA.
//
// ── EL PROBLEMA QUE ARREGLA ───────────────────────────────────────────────────────────────────
//
// En Odoo, a un picker no se le asigna un pedido: se le asigna una TANDA (un `stock.picking.batch`,
// «BATCH/54939»). Los pedidos de una tanda se le dan JUNTOS y se validan JUNTOS, así que los tres
// tienen la misma hora de asignación y casi la misma hora de término. Comprobado en Odoo el
// 13/11/2026:
//
//     BATCH/54939 · Pickers 6 · 3 pedidos
//       99REC/DT/120774   asignado 15-09 14:07   validado 15-09 15:26   → 1,3172 h
//       99REC/DT/120744   asignado 15-09 14:07   validado 15-09 15:26   → 1,3172 h
//       99REC/DT/120891   asignado 15-09 14:07   validado 15-09 15:26   → 1,3175 h
//
// Sumar la duración de cada pedido daba **3,95 h** por una tanda que duró **1,32 h**. La misma
// hora de trabajo se contaba tres veces. Medido sobre octubre completo, la inflación va de
// **1,66× a 3,9×**, y en la cuenta «Mario Patiño» —donde dos personas trabajan con el mismo
// usuario— llega a **10,06×**.
//
// Eso arrastraba a `avgMinutesPerOp`, a `avgSecondsPerLine` y sobre todo a `cph` (unidades por
// hora), que es la métrica del bono: con el tiempo inflado 1,7 veces, el ritmo salía 1,7 veces
// más bajo de lo real.
//
// ── DE DÓNDE SALE ESTA REGLA ──────────────────────────────────────────────────────────────────
//
// No se inventó acá. Es exactamente lo que hace la planilla con la que la jefatura calcula el
// bono —hoja «Tiempo Picking» del archivo «Abastecimiento por Olas»—, en su columna `Tiempo_R`:
//
//     =IF(H2=""; ""; IF(COUNTIF($H$2:H2; H2)=1; G2; 0))
//
// En castellano: la columna `H` es la tanda y la `G` su duración; el tiempo se cuenta **una sola
// vez por tanda**, en la primera fila donde esa tanda aparece, y las demás suman cero. Medido en
// esa hoja: 3.433 de 3.476 tandas tienen un único valor de duración en todas sus filas, y en
// 3.475 de 3.476 el `Tiempo_R` de la tanda es igual a su duración.
//
// Y la duración de la tanda en esa planilla es `max(validado) − min(asignado)` de sus pedidos:
// calza con Odoo a cuatro decimales en los tres casos verificados.
//
// ── POR QUÉ `max − min` Y NO LA DURACIÓN DE UN PEDIDO CUALQUIERA ──────────────────────────────
//
// Porque los pedidos de una tanda no terminan todos en el mismo segundo: en BATCH/54939 dos
// marcan 1,3172 h y el tercero 1,3175. Tomar «el primero» haría que el número dependiera del
// orden en que Odoo devolvió las filas. `max − min` es el lapso que la tanda ocupó de verdad y
// no depende del orden.
//
// ── LO QUE NO TIENE TANDA ─────────────────────────────────────────────────────────────────────
//
// Un pedido sin `batch_id` cuenta con su propia duración, como antes. Son los que se trabajan
// sueltos, y ahí no hay nada que des-duplicar.
//
// Puro y sin red: entran operaciones, salen minutos.

/** Las fechas llegan como el naive UTC de Odoo, o `false` cuando no están. */
export type FechaOdoo = string | false | null | undefined;

export interface OperacionConTanda {
  /** `batch_id` de Odoo, ya resuelto a texto. `null` = el pedido se trabajó suelto. */
  tanda: string | null;
  /** `user_assigned_date`: cuándo se le dio el trabajo a esta persona. */
  asignadoEn: FechaOdoo;
  /** `date_done`: cuándo lo validó. */
  validadoEn: FechaOdoo;
}

export interface MinutosTrabajados {
  /** Los minutos que de verdad ocupó el trabajo, sin repetir tandas. */
  minutos: number;
  /** Operaciones que aportaron al tiempo (tenían las dos horas). Es el divisor de los promedios. */
  medidas: number;
  /** Operaciones con alguna hora faltante: no se pudieron medir y no se esconden. */
  sinMedir: number;
  /** Cuántas tandas distintas hubo. Una tanda con 3 pedidos es UN lapso de trabajo, no tres. */
  tandas: number;
}

/** El naive UTC de Odoo a milisegundos, o `null`. */
function enMs(f: FechaOdoo): number | null {
  if (!f || typeof f !== 'string') return null;
  const t = Date.parse(f.includes('T') ? f : f.replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : null;
}

/**
 * Los minutos trabajados por UNA persona, contando cada tanda una sola vez.
 *
 * Se truncan los segundos al minuto, igual que `duracionMinutos`, para que el número no cambie
 * por un segundo de más al recargar.
 */
export function minutosTrabajados(ops: readonly OperacionConTanda[]): MinutosTrabajados {
  /** Por tanda: el asignado más temprano y el validado más tardío. */
  const porTanda = new Map<string, { desde: number; hasta: number }>();
  let sueltos = 0;      // minutos de los pedidos sin tanda
  let medidas = 0;
  let sinMedir = 0;

  for (const o of ops) {
    const a = enMs(o.asignadoEn), b = enMs(o.validadoEn);
    if (a === null || b === null || b < a) { sinMedir++; continue; }
    medidas++;
    const t = (o.tanda ?? '').trim();
    if (!t) {
      sueltos += Math.floor(b / 60000) - Math.floor(a / 60000);
      continue;
    }
    const v = porTanda.get(t);
    if (!v) porTanda.set(t, { desde: a, hasta: b });
    else { if (a < v.desde) v.desde = a; if (b > v.hasta) v.hasta = b; }
  }

  let deTandas = 0;
  for (const { desde, hasta } of porTanda.values())
    deTandas += Math.floor(hasta / 60000) - Math.floor(desde / 60000);

  return { minutos: sueltos + deTandas, medidas, sinMedir, tandas: porTanda.size };
}
