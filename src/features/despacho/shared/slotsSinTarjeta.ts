// Qué unidades de Picking todavía NO tienen tarjeta en el formulario de Bodega. Puro y testeable.
//
// Esta regla vivía DUPLICADA y palabra por palabra en los dos espejos de Bodega
// (`StepForm.tsx:1137-1140` en RM/Costa y `TiendasPage.tsx:495-498` en Nacional). Es exactamente el
// patrón que este repositorio ya pagó caro: dos copias de la misma regla que se arreglan por
// separado, hasta que una queda atrás.
//
// El backfill que la usa es el que reconstruye las tarjetas al entrar a una tienda: por cada slot
// que no está representado, agrega una. Por eso una fila a la que le falte el `pickingSlotId`
// termina con una tarjeta DUPLICADA — el slot existe, la fila no lo declara, y el backfill lo da
// por ausente.

/** Lo que hace falta saber de una unidad de Picking para decidir si le falta tarjeta. */
export interface SlotParaTarjeta {
  id: number;
  tipo: string;              // P | B | C | CH
  contenido: string | null;
  /** 'Bodega' si lo creó Bodega (fn_create_bodega_slot); si no, el picker que lo armó. */
  picker_label?: string | null;
}

/** Lo que hace falta saber de un ítem ya guardado. */
export interface ItemConSlot {
  pickingSlotId?: number | null;
}

/**
 * Los slots que todavía no tienen tarjeta.
 *
 * Tres condiciones, y cada una está por una razón distinta:
 *
 *  1. **No representado**: si alguna fila ya declara ese `pickingSlotId`, no falta nada. Es la
 *     condición que se rompe cuando una fila guarda su ítem pero no anota el slot.
 *  2. **No congelado**: los CC/CN tienen su propio tablero; SECO no debe inventarles tarjeta.
 *  3. **CH de Bodega solo si su ítem ya existe**: el «+ Choc.» de Bodega crea el slot y el ítem a la
 *     vez, y el slot llega ~600 ms antes que el estado, así que crear la tarjeta apenas aparece el
 *     slot hacía parpadear los chocolates. Exigir el ítem lo evita. Un CH que arma PICKING no tiene
 *     ítem hasta que alguien lo pesa en Bodega: con esa regla nunca aparecía con la tienda abierta,
 *     solo al salir y volver o recargar (38SP2, 13/10/2026, «0/3 ch.» sin ninguna tarjeta).
 */
export function slotsSinTarjeta<S extends SlotParaTarjeta>(
  slots: readonly S[],
  representados: ReadonlySet<number>,
  itemsGuardados: readonly ItemConSlot[],
): S[] {
  return slots.filter(s =>
    !representados.has(s.id)
    && !esCongelado(s.contenido)
    && (s.tipo !== 'CH' || s.picker_label !== 'Bodega' || itemsGuardados.some(it => it.pickingSlotId === s.id)));
}

/** Mismo criterio que `esCongeladoContenido`; acá para que el módulo no dependa de nada. */
function esCongelado(contenido: string | null | undefined): boolean {
  return (contenido ?? '').toLowerCase().includes('congelado');
}

/** Los `pickingSlotId` que las filas actuales ya declaran. */
export function slotsRepresentados(filas: readonly { pickingSlotId?: number | null }[]): Set<number> {
  return new Set(filas.map(f => f.pickingSlotId).filter((x): x is number => x != null));
}
