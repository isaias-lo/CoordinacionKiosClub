// Pegarle a una tarjeta el slot que acaba de crear «+ Pallet» sin que quede otra para el mismo slot.
// Puro.
//
// ── POR QUÉ ────────────────────────────────────────────────────────────────────────────────────
//
// «+ Pallet» agrega la tarjeta en el acto, sin slot, y recién después espera a `create-bodega`.
// Con red lenta, la recarga de Picking puede traer ese slot ANTES que la respuesta: la tarjeta
// nueva todavía no lo declara, así que el relleno (`slotsSinTarjeta`) arma otra (`bk-pick-…`) para
// él. Cuando llega la respuesta, las dos dicen el mismo slot: dos tarjetas para un pallet.
//
// Regla: queda una tarjeta por slot. Se descartan las gemelas EN BLANCO (sin guardar y sin que
// nadie escribiera). Si la gemela tiene algo y la nuestra está en blanco, se descarta la nuestra.
// Si las dos tienen algo, quedan las dos: elegir sería perder lo que alguien escribió.

export interface FilaConSlot {
  id: string;
  pickingSlotId?: number | null;
  saved?: boolean;
  tocada?: boolean;
}

const enBlanco = (f: FilaConSlot) => !f.saved && !f.tocada;

export function asignarSlotSinGemelas<F extends FilaConSlot>(filas: F[], filaId: string, slotId: number): F[] {
  const out = filas.map(f => (f.id === filaId ? { ...f, pickingSlotId: slotId } : f));
  const mia = out.find(f => f.id === filaId);
  if (!mia) return filas;
  const gemelas = out.filter(f => f.id !== filaId && f.pickingSlotId === slotId);
  if (!gemelas.length) return out;
  if (enBlanco(mia) && gemelas.some(g => !enBlanco(g))) {
    // Si la nuestra se va, las gemelas en blanco que sobren también: queda la que tiene algo.
    return out.filter(f => f.id !== filaId && !(f.pickingSlotId === slotId && enBlanco(f)));
  }
  return out.filter(f => f.id === filaId || f.pickingSlotId !== slotId || !enBlanco(f));
}
