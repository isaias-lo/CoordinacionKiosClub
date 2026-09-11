// Imprimir solo las etiquetas seleccionadas en una tarjeta de Picking. Puro y testeable.
//
// Antes la selección viajaba como NÚMEROS de pallet sueltos (`palletNum`), sin el tipo. Pero cada
// tipo numera por separado —P1, P2… y B1, B2… en paralelo—, así que P1 y B1 tienen el mismo número.
// Seleccionar B1 imprimía P1 y B1. Ahora la selección viaja como IDS de pallet, que son únicos.

/**
 * Los ids de los pallets que se tocaron en la tarjeta.
 *
 * Ignora un índice que ya no existe (la tarjeta cambió mientras se elegía) y un pallet con id
 * temporal (≤ 0): todavía no se guardó, así que no tiene etiqueta real que imprimir.
 */
export function idsDeSeleccion(slots: { id: number }[], indices: Iterable<number>): Set<number> {
  const ids = new Set<number>();
  for (const i of indices) {
    const id = slots[i]?.id;
    if (typeof id === 'number' && id > 0) ids.add(id);
  }
  return ids;
}

/**
 * Las etiquetas de la selección: de ESE encargado y con ESE id. Una selección vacía no imprime nada
 * — nunca cae a "todas" por defecto, que es justo el error que se reportó.
 */
export function etiquetasDeLaSeleccion<L extends { stateKey: string; slotId: number }>(
  etiquetas: L[], sel: { stateKey: string; slotIds: Set<number> },
): L[] {
  return etiquetas.filter(e => e.stateKey === sel.stateKey && sel.slotIds.has(e.slotId));
}
