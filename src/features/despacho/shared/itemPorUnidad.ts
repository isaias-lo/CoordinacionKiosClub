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

/**
 * ¿Esto es un reingreso? — la unidad ya tenía un ítem pesado DE VERDAD (no un "sin pesar") antes
 * de este guardado. `fusionarConPrevio` ya lo resuelve bien — no se duplica el ítem — pero la
 * persona igual volvió a pesar algo que un compañero ya había cargado: es justo el trabajo
 * duplicado que hubo que medir a mano el 17/09 (ver la cabecera de este archivo, y el commit que
 * arregló la tarjeta vacía). Detectarlo automáticamente — para registrarlo en `actividad_bodega`
 * — es lo que evita depender de otra medición manual la próxima vez.
 */
export function esReingreso<T extends ItemConUnidad>(previo: T | undefined): boolean {
  return previo !== undefined && !esSinPesar(previo);
}

/**
 * ¿Este guardado es trabajo REHECHO, o es el cierre de una suma?
 *
 * `esReingreso` mira una sola cosa: si la unidad ya tenía un ítem pesado. Eso alcanza para el caso
 * que importa —otra persona ya la había pesado— pero marca como reingreso algo que no lo es.
 *
 * Sumar un bulto a un pallet REABRE la tarjeta del pallet con el peso ya sumado, para que la
 * persona ajuste la altura y vuelva a darle Agregar. Ese segundo guardado encuentra un ítem previo
 * pesado, y hasta ahora se registraba como reingreso: "ya estaba pesado (259,1kg → 259,1kg)",
 * misma persona, el mismo segundo.
 *
 * Medido el 25/09: de los 5 reingresos registrados en 14 días, **los 5** eran esto. O sea que el
 * aviso no estaba midiendo trabajo duplicado — estaba midiendo el flujo de sumar, y además le
 * decía a la persona que había repetido trabajo justo cuando hizo lo correcto.
 *
 * El porcentaje del panel NO se apoyaba en esto (`reingresosBodega.medirDias` reconstruye los
 * repetidos desde `registrar_item` y ya separa "misma persona"), así que esa medición sigue valiendo.
 */
export function esReingresoDeVerdad<T extends ItemConUnidad>(previo: T | undefined, veniaDeSumar: boolean): boolean {
  return !veniaDeSumar && esReingreso(previo);
}
