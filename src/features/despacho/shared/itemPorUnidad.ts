// Un ítem de Bodega por cada unidad de Picking. Puro y testeable.
//
// Existe por 01TPS el 2026-09-11: una persona guardó el bulto #12997 "sin pesar" a las 16:20 y
// otra, desde otro equipo, lo pesó a las 16:24. En el segundo equipo la tarjeta seguía "sin
// guardar" — el ítem ya había llegado del otro equipo, pero las tarjetas en progreso no se tocan
// para no pisar lo que alguien está escribiendo —, así que al guardar se AGREGÓ un segundo ítem
// para la misma unidad. Bodega contó 7 bultos donde había 6, y el Manual y el Enrutador leen ese
// conteo (despacho_sesion).
//
// El merge entre equipos ya usa la unidad como llave (`stableItemKey`), pero solo en las tiendas
// que ese equipo editó; el alta local no pasaba por ahí.

import { esSinPesar } from './sinPesar';

interface ItemConUnidad {
  pickingSlotId?: number;
  peso: number;
  id?: string;
  orden?: string;
}

const MEDIDAS = ['peso', 'alto', 'largo', 'ancho', 'pesoVolumetrico'] as const;

/**
 * Lo que queda al guardar `nuevo` sobre un ítem que ya existía para la misma unidad.
 *
 * Gana lo nuevo (es lo último que alguien confirmó), con dos excepciones:
 * - Sigue siendo el mismo ítem: conserva su `id` y su `orden` (su lugar y su número).
 * - "Sin pesar" encima de un ítem pesado no borra el peso: 0 kg quiere decir "no se pesó", no
 *   "pesa 0". Se conservan las medidas que ya tenía.
 */
export function fusionarConPrevio<T extends ItemConUnidad>(previo: T, nuevo: T): T {
  const out: T = { ...nuevo };
  if (esSinPesar(nuevo) && !esSinPesar(previo)) {
    const desde = previo as unknown as Record<string, unknown>;
    const hacia = out as unknown as Record<string, unknown>;
    for (const k of MEDIDAS) if (k in desde) hacia[k] = desde[k];
  }
  if (previo.id !== undefined) out.id = previo.id;
  if (previo.orden !== undefined) out.orden = previo.orden;
  return out;
}

/**
 * Agrega a la lista de una tienda un ítem recién guardado. Si ya hay uno de la misma unidad de
 * Picking, lo reemplaza en su lugar (fusionado con {@link fusionarConPrevio}) en vez de sumar otro.
 * Un ítem sin unidad se agrega siempre: no hay con qué compararlo.
 */
export function agregarSinDuplicar<T extends ItemConUnidad>(lista: T[], nuevo: T): T[] {
  const idx = nuevo.pickingSlotId == null ? -1 : lista.findIndex(i => i.pickingSlotId === nuevo.pickingSlotId);
  if (idx < 0) return [...lista, nuevo];
  const out = [...lista];
  out[idx] = fusionarConPrevio(lista[idx], nuevo);
  return out;
}

/** El ítem que ya existe en la lista para esa unidad, si hay. */
export function itemDeLaUnidad<T extends ItemConUnidad>(lista: T[], slotId: number | undefined): T | undefined {
  return slotId == null ? undefined : lista.find(i => i.pickingSlotId === slotId);
}
