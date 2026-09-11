// Deshacer "sumar a pallet" en Bodega. Puro y testeable — no toca red ni base.
//
// Sumar un bulto o un chocolate a un pallet BORRA el slot del bulto (item + slot, ver
// [[bodega-borrar-slot-picking]]) y le pasa su peso al pallet. Hasta ahora no tenía vuelta:
// borrar y unificar pallet→pallet sí mostraban "Revertir", sumar no. Justo el caso reportado,
// "si se suma por error".
//
// Revertir re-crea el slot. Lo delicado es el NÚMERO: create-bodega le da el siguiente seq libre,
// así que un CH3 sumado y revertido volvía como CH7 — y desde que la card muestra el `seq` (el
// número impreso en la caja), eso se vería como que el sistema le cambió el nombre. Por eso se
// le devuelve su seq original cuando nadie más lo tomó.

interface SlotConNumero { id: number; tipo: string; seq: number | null }

/**
 * ¿Se le puede devolver al slot re-creado su número original?
 *
 * Solo si ningún OTRO slot activo del mismo tipo lo tiene. El caso que esto evita: se suma el
 * ÚLTIMO chocolate (el CH3), y como `fn_create_bodega_slot` calcula max+1 sobre los activos, el
 * siguiente alta vuelve a recibir el 3. Devolverle el 3 al revertido crearía dos CH3.
 *
 * `excluirId` es el propio slot recién creado: create-bodega ya le asignó un seq, y ese no cuenta
 * como "tomado por otro".
 */
export function seqRestaurable(
  seq: number | null | undefined, tipo: string, activos: SlotConNumero[], excluirId?: number,
): boolean {
  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq <= 0) return false;
  return !activos.some(s => s.id !== excluirId && s.tipo === tipo && s.seq === seq);
}

/**
 * Reapunta el `pickingSlotId` de los items a sus slots re-creados.
 *
 * Generaliza `remapPickingSlot` (que hace uno) a los N de una suma en masa. Si un slot no se
 * pudo re-crear, el item queda SIN slot en vez de apuntando al id viejo: ese slot ya no existe,
 * y apuntarlo dejaría un pallet fantasma, invisible para Seguimiento y el Enrutador.
 */
export function remapSlots<T extends { pickingSlotId?: number | null }>(
  items: T[], mapa: Map<number, number | undefined>,
): T[] {
  return items.map(i =>
    i.pickingSlotId != null && mapa.has(i.pickingSlotId)
      ? { ...i, pickingSlotId: mapa.get(i.pickingSlotId) }
      : i);
}

/** Texto del snackbar. Nombra hasta tres; más que eso los cuenta, porque es de una línea. */
export function etiquetaSuma(origenes: string[], destino: string): string {
  if (origenes.length === 1) return `${origenes[0]} sumado a ${destino}`;
  if (origenes.length <= 3) return `${origenes.join(', ')} sumados a ${destino}`;
  return `${origenes.length} bultos sumados a ${destino}`;
}
