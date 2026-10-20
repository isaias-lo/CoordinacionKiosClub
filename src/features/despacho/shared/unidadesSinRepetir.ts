// Las tarjetas a sumar, una por unidad. Puro.
//
// ── POR QUÉ (60PBL, 20/10/2026) ────────────────────────────────────────────────────────────────
//
// Steven sumó los 6 CH de Los Pablos a P1 (+52,3 kg), revirtió la suma 8 s después y volvió a
// sumar con «Todos»: el aviso dijo «11 ítems» y P1 subió 93,9 kg. Eran los mismos 6 CH más cinco
// tarjetas repetidas de CH1 a CH5. La suma las contó dos veces: P1 quedó 41,6 kg más pesado de lo
// real. De dónde salían las repetidas está en `slotsUnicos.ts`; esto es la segunda barrera, por si
// otro camino vuelve a dejar dos tarjetas para la misma unidad.
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
    const { slot, item } = claves(f);
    if ((slot != null && slots.has(slot)) || (item != null && items.has(item))) continue;
    if (slot != null) slots.add(slot);
    if (item != null) items.add(item);
    unicas.push(f);
  }
  return { unicas, repetidas: filas.length - unicas.length };
}

function claves(f: TarjetaSumable): { slot: number | null; item: string | null } {
  return { slot: f.pickingSlotId ?? f.savedItem?.pickingSlotId ?? null, item: f.savedItem?.id ?? null };
}

/** ¿Las dos tarjetas son la misma unidad? Mismo criterio que `unidadesSinRepetir`. */
export function esMismaUnidad(a: TarjetaSumable, b: TarjetaSumable): boolean {
  const ka = claves(a), kb = claves(b);
  return (ka.slot != null && ka.slot === kb.slot) || (ka.item != null && ka.item === kb.item);
}

/** Aviso cuando la selección traía tarjetas repetidas. */
export function avisoRepetidas(n: number): string {
  return n === 1
    ? 'Una tarjeta estaba repetida y no se sumó dos veces'
    : `${n} tarjetas estaban repetidas y no se sumaron dos veces`;
}
