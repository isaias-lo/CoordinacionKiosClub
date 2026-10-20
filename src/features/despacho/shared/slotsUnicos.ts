// Un slot de Picking, una entrada en la lista de la tienda. Puro.
//
// ── POR QUÉ (60PBL, 20/10/2026) ────────────────────────────────────────────────────────────────
//
// `revertirSuma` recrea los slots uno por uno y, al terminar, AGREGA los nuevos a la lista local.
// Pero cada slot recreado dispara el canal de Picking, y la recarga (600 ms de debounce) ya los
// había metido en la lista, con `slotsRecienAgregados` incluso si la consulta no los veía. Al
// agregarlos otra vez quedaron dos entradas para CH1–CH5 (CH6, el último, todavía no había vuelto
// por la recarga). La reconstrucción de la tienda arma una tarjeta por entrada: diez tarjetas para
// cinco chocolates, y la suma siguiente con «Todos» las sumó todas (P1 +41,6 kg de más).
//
// Regla: la lista de slots de una tienda nunca repite un id. Gana la primera entrada. Los slots
// sin id (0, el relleno cuando no hay datos completos de Picking) no se tocan.

export function slotsUnicos<S extends { id: number }>(slots: readonly S[]): S[] {
  const vistos = new Set<number>();
  const out: S[] = [];
  for (const s of slots) {
    if (s.id) {
      if (vistos.has(s.id)) continue;
      vistos.add(s.id);
    }
    out.push(s);
  }
  return out.length === slots.length ? (slots as S[]) : out;
}

/** Agrega `nuevos` a `actuales` sin repetir ninguno que ya esté. */
export function agregarSlots<S extends { id: number }>(actuales: readonly S[] | undefined, nuevos: readonly S[]): S[] {
  return slotsUnicos([...(actuales ?? []), ...nuevos]);
}
