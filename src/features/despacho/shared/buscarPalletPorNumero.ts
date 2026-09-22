// Buscar un pallet/bulto por su número (picking_pallets.id — el "#<n>" impreso en la etiqueta,
// ver BarcodeCard.tsx) entre TODAS las tiendas de la bodega, no solo la que está abierta. Puro y
// testeable.
//
// Antes el buscador de Bodega solo filtraba la lista de tiendas por nombre/código: para llegar a
// un pallet puntual había que adivinar en qué tienda estaba, abrirla, y buscarlo a ojo entre las
// tarjetas. El número que la persona tiene a mano (lo lee de la etiqueta física del pallet) es
// justo el que este buscador ahora reconoce.

export interface SlotConId {
  id: number;
}

export interface PalletEncontrado<Slot extends SlotConId> {
  /** Clave con la que el espejo indexa sus mapas por tienda — código en Santiago, nombre en
   *  Regiones. Este módulo no necesita saber cuál es. */
  claveTienda: string;
  slot: Slot;
}

/**
 * Si `query` es un número de pallet válido (solo dígitos) y existe entre los slots activos de
 * CUALQUIER tienda, devuelve en qué tienda está y el slot completo. `null` si `query` no es
 * puramente numérico o no hay match — así el llamador sabe cuándo mostrar el resultado especial
 * de pallet y cuándo el buscador de tiendas de siempre.
 */
export function buscarPalletPorNumero<Slot extends SlotConId>(
  slotsPorTienda: Record<string, readonly Slot[]>,
  query: string,
): PalletEncontrado<Slot> | null {
  const q = query.trim();
  if (!q || !/^\d+$/.test(q)) return null;
  const id = Number(q);
  for (const [claveTienda, slots] of Object.entries(slotsPorTienda)) {
    const slot = slots.find(s => s.id === id);
    if (slot) return { claveTienda, slot };
  }
  return null;
}
