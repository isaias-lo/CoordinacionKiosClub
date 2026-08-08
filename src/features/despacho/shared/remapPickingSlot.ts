/* ── Remap de picking slot ────────────────────────────────────────────────────
   Al revertir una unificación, el slot del pallet source se RECREA (id nuevo, porque el
   original se borró en la unión). Esta función reasigna, en la lista de items, el
   `pickingSlotId` que apuntaba al slot viejo (borrado) por el nuevo. Puro y testeable. */

export function remapPickingSlot<T extends { pickingSlotId?: number | null }>(
  items: T[],
  fromSlot: number | null | undefined,
  toSlot: number | null | undefined,
): T[] {
  if (fromSlot == null) return items;
  return items.map(i => (i.pickingSlotId === fromSlot ? { ...i, pickingSlotId: toSlot } : i));
}
