import type { PickingSlot } from '../santiago/components/PickingSlotCards';

// [RC-5] El gemelo de `fueRecienBorrado` (ver `eliminarSlotPicking.ts`), para el otro lado.
//
// Aquel existe porque la recarga de picking podía REVIVIR un slot recién borrado. Este existe
// porque la misma recarga puede HACER DESAPARECER uno recién creado, y no había nada que lo
// impidiera:
//
//   · `load()` arma el mapa de slots desde cero y hace `setPickingSlotsFull(full)` — lo REEMPLAZA
//     entero, no lo fusiona.
//   · El canal de picking dispara ese `load()` con 600 ms de debounce ante cualquier cambio.
//   · Si un `load()` salió ANTES del INSERT y llega DESPUÉS, su respuesta no trae el slot nuevo.
//     Al reemplazar el mapa, el slot recién creado se borra de la pantalla aunque exista en la base.
//
// Eso es, literalmente, "agregué un pallet y casi de inmediato se volvió a salir": la fila
// sobrevive pero pierde su `seq`, y el ítem se guarda sin `canonical_id`.
//
// La ventana es la misma que la del borrado (5 s de margen de propagación) y se limpia sola.

const recienAgregados = new Map<number, SlotRecienAgregado>();
const TTL_MS = 5000;

export interface SlotRecienAgregado {
  /** El código de tienda con el que se creó (Nacional indexa por nombre, así que hay que traducir). */
  storeCod: string;
  slot: PickingSlot;
}

/** Marca un slot como recién creado (auto-expira). Lo llama `crearSlotBodega`. */
export function marcarRecienAgregado(storeCod: string, slot: PickingSlot): void {
  recienAgregados.set(slot.id, { storeCod, slot });
  setTimeout(() => recienAgregados.delete(slot.id), TTL_MS);
}

/** Los slots creados en los últimos segundos. */
export function slotsRecienAgregados(): SlotRecienAgregado[] {
  return [...recienAgregados.values()];
}

/** Solo para tests: vacía el registro. */
export function _limpiarRecienAgregados(): void {
  recienAgregados.clear();
}

/**
 * Los slots recién creados que ESTA consulta no trajo, listos para re-agregar al mapa.
 *
 * Puro a propósito: es la parte que decide, y es la que hay que poder probar sin red ni relojes.
 *
 * `claveDe` traduce el código de tienda a la clave con que cada espejo indexa su mapa — RM/Costa
 * usa el código y Nacional el nombre. Si devuelve `undefined`, la tienda no es de este tablero y el
 * slot se ignora: no se inventa una entrada para una tienda que no existe acá.
 */
export function faltantesEnLaConsulta(
  full: Record<string, { id: number }[]>,
  recientes: readonly SlotRecienAgregado[],
  claveDe: (storeCod: string) => string | undefined,
): { clave: string; slot: PickingSlot }[] {
  const out: { clave: string; slot: PickingSlot }[] = [];
  for (const { storeCod, slot } of recientes) {
    const clave = claveDe(storeCod);
    if (!clave) continue;
    if ((full[clave] ?? []).some(s => s.id === slot.id)) continue;   // la consulta ya lo trajo
    out.push({ clave, slot });
  }
  return out;
}
