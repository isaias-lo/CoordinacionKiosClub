// La lápida de un borrado: que borrar algo siga queriendo decir borrado después del próximo push.
//
// Medido el 24/09 sobre `actividad_bodega` (12 días): de 135 chocolates borrados, **35 volvieron y
// hubo que borrarlos de nuevo** — 26%. El caso más claro, 33CON el 16/09: CH2…CH11 borrados entre
// las 15:06:42 y las 15:06:55, y los mismos nueve borrados otra vez entre las 15:06:55 y las
// 15:06:59. También le pasó a un pallet (P5 de 04PDG, 15/09, con 49 minutos entre un borrado y el
// otro), así que NO es un problema del chocolate: es que el chocolate es el 94% de lo que se borra.
//
// El DELETE a `picking_pallets` nunca falló — de 155 borrados registrados en esos 12 días, cero
// slots sobrevivieron. Lo que vuelve no es la unidad de Picking: es el ÍTEM, por el merge de
// `shared_session_state`.
//
// El mecanismo, que es el mismo en los dos espejos:
//
//   1. El merge de tres vías decide con `base` = lo último que este equipo empujó o adoptó.
//   2. Un ítem que está en `base` y ya no está en `local` se lee como "lo borré yo" y NO se
//      resucita aunque el remoto lo traiga. Ese es el anti-zombie que ya existe, y funciona.
//   3. Pero al empujar, `base` pasa a ser el estado NUEVO — el que ya no tiene el ítem. Desde ese
//      instante el ítem no está ni en `local` ni en `base`, así que el mismo remoto que antes se
//      descartaba ahora se lee como **un alta nueva del otro equipo** y entra.
//
// O sea: el borrado se recuerda 2,5 segundos (lo que tarda el debounce del push) y después se
// olvida. Cualquier equipo que todavía no haya recibido el borrado y empuje su copia —no hace
// falta que borre nada, le alcanza con agregar un pallet en otra tienda— devuelve el ítem.
//
// Y si la tienda quedó "limpia" (local == base, que es exactamente como queda justo después de
// empujar), el merge adopta la tienda REMOTA ENTERA y vuelven todos de una vez. Por eso se borran
// cuatro cajas y "al salir aparece una": vuelven las que alcanzaron a quedar del otro lado.
//
// La lápida arregla eso: el borrado se recuerda aparte de la base, y el merge descarta cualquier
// ítem remoto que tenga una lápida puesta. Se levanta sola cuando la unidad se vuelve a crear
// (Revertir), que es el único caso en que el ítem debe poder volver.

/**
 * Llaves con lápida. Sin TTL a propósito.
 *
 * `recienBorrados` (ver `eliminarSlotPicking`) dura 5 segundos porque protege de UNA recarga en
 * vuelo. Esto protege de otra cosa: de cualquier equipo con una copia vieja, y esas copias viven
 * lo que viva su pestaña. En los datos hay reapariciones a los 13 segundos y a los 49 minutos.
 *
 * Un `id` de `picking_pallets` es una secuencia: no se reutiliza nunca, así que una lápida vieja no
 * puede tapar por error a una unidad distinta. La memoria se va con la pestaña, y el día siguiente
 * empieza limpio porque el estado se indexa por fecha.
 */
const lapidas = new Set<string>();

/** La llave de una unidad de Picking, en el mismo formato que `stableItemKey`. */
export function llaveDeSlot(slotId: number): string {
  return `slot:${slotId}`;
}

/**
 * Marca una unidad como borrada. Lo llama `eliminarSlotPicking`, que es el único punto por donde
 * pasan TODOS los borrados de los dos espejos (formulario, Resumen y fila sin guardar).
 */
export function marcarLapida(slotId?: number | null): void {
  if (slotId == null) return;
  lapidas.add(llaveDeSlot(slotId));
}

/**
 * Levanta la lápida de una unidad. Lo llama `crearSlotBodega`, que es por donde pasa toda alta de
 * Bodega — incluido el Revertir, que recrea el slot.
 *
 * `create-bodega` entrega un id nuevo, así que en la práctica no hay lápida que levantar; está por
 * si algún día un slot se reactiva en vez de recrearse. Una lápida que no se levanta nunca es
 * exactamente el bug contrario al que esto arregla, y sale más barato prevenirlo que descubrirlo.
 */
export function levantarLapida(slotId?: number | null): void {
  if (slotId == null) return;
  lapidas.delete(llaveDeSlot(slotId));
}

/** ¿Esta llave —la de `stableItemKey`— corresponde a algo que se borró acá? */
export function tieneLapida(llave: string): boolean {
  return lapidas.has(llave);
}

/** Solo para tests: vacía el registro. */
export function _limpiarLapidas(): void {
  lapidas.clear();
}
