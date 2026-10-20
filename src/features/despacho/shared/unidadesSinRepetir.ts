// Las tarjetas a sumar, una por unidad. Puro.
//
// ── POR QUÉ (60PBL, 20/10/2026) ────────────────────────────────────────────────────────────────
//
// Steven sumó los 6 CH de Los Pablos a P1 (+52,3 kg), revirtió la suma 8 s después y volvió a
// sumar con «Todos»: el aviso dijo «11 ítems» y P1 subió 93,9 kg. Eran los mismos 6 CH más cinco
// tarjetas repetidas de CH1 a CH5. El revertir recrea los slots uno por uno (CH6, el último, no
// alcanzó a repetirse), y en ese rato quedaron dos tarjetas guardadas para la misma unidad. La
// suma las contó dos veces: P1 quedó 41,6 kg más pesado de lo real.
//
// Regla: una unidad se suma una sola vez. Dos tarjetas son la misma unidad si comparten slot de
// Picking o el mismo ítem guardado (el revertir conserva el `id` del ítem aunque cambie su slot).
// Gana la primera; las repetidas se descartan y se avisa cuántas.

export interface TarjetaSumable {
  id: string;
  pickingSlotId?: number | null;
  savedItem?: { id?: string; pickingSlotId?: number | null } | null;
}

export function unidadesSinRepetir<T extends TarjetaSumable>(filas: T[]): { unicas: T[]; repetidas: number } {
  const slots = new Set<number>();
  const items = new Set<string>();
  const unicas: T[] = [];
  for (const f of filas) {
    const slot = f.pickingSlotId ?? f.savedItem?.pickingSlotId ?? null;
    const item = f.savedItem?.id ?? null;
    if ((slot != null && slots.has(slot)) || (item != null && items.has(item))) continue;
    if (slot != null) slots.add(slot);
    if (item != null) items.add(item);
    unicas.push(f);
  }
  return { unicas, repetidas: filas.length - unicas.length };
}

/** Aviso cuando la selección traía tarjetas repetidas. */
export function avisoRepetidas(n: number): string {
  return n === 1
    ? 'Una tarjeta estaba repetida y no se sumó dos veces'
    : `${n} tarjetas estaban repetidas y no se sumaron dos veces`;
}
