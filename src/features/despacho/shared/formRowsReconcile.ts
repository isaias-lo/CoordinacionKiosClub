/**
 * Reconciliación de formRows con el estado (dispatchData / items) tras un merge remoto.
 *
 * Contexto del bug ("freeze al SUMAR A PALLET"):
 *   `formRows` es estado derivado que sólo se reconstruye cuando cambia la tienda
 *   seleccionada (useLayoutEffect con deps [selectedTienda]). Cuando llega el eco de
 *   `shared_session_state` (LOAD_STATE), el array de items de la tienda se reemplaza y
 *   `renumberItems` reescribe el `orden`, pero `formRows` NO se reconstruye → el
 *   `savedItem` embebido en cada fila queda desactualizado (orden viejo). El siguiente
 *   "SUMAR A PALLET" ya no encuentra el item (match por pkg+orden falla) y el UPDATE es
 *   un no-op → la UI parece congelada.
 *
 * Solución (pura, testeable):
 *   `reconcileSavedRows` refresca SOLO el `savedItem` de las filas ya guardadas contra los
 *   items nuevos del contexto, PRESERVANDO las filas en progreso (no guardadas) tal cual —
 *   nada de lo que el usuario está escribiendo se pierde. El match usa un id ESTABLE
 *   (pickingSlotId o el id propio del item) que sobrevive a `renumberItems`.
 */

/** Fila de formulario mínima que necesitamos para reconciliar. Genérica sobre el item. */
export interface ReconcilableRow<Item> {
  id: string;
  saved?: boolean;
  savedItem?: Item;
  pickingSlotId?: number;
}

/**
 * Clave estable para emparejar un item de contexto con la fila guardada que lo representa.
 * Preferimos el pickingSlotId (FK inmutable a picking_pallets); si el item no tiene slot,
 * usamos su id propio (Santiago) o `orden` como último recurso (Regiones sin slot).
 */
export function stableItemKey(item: {
  pickingSlotId?: number;
  id?: string;
  orden?: string;
}): string {
  if (item.pickingSlotId != null) return `slot:${item.pickingSlotId}`;
  if (item.id != null) return `id:${item.id}`;
  if (item.orden != null) return `orden:${item.orden}`;
  return '';
}

/**
 * Reconcilia las filas guardadas de `rows` con los `items` actuales del contexto.
 *
 * - Filas NO guardadas (en progreso) → se dejan intactas (posición y contenido).
 * - Filas guardadas cuyo item sigue existiendo → se refresca su `savedItem` con la
 *   referencia nueva del contexto (orden/peso actualizados), manteniendo `id` de fila.
 * - Filas guardadas cuyo item ya NO existe en el contexto (fue eliminado remotamente,
 *   p. ej. absorbido en otro dispositivo) → se descartan.
 *
 * No reordena ni crea filas nuevas para items nuevos que aparezcan sólo en el contexto:
 * eso lo hace la reconstrucción completa del useLayoutEffect al cambiar de tienda. Aquí
 * sólo mantenemos coherentes las referencias para que las acciones (sumar/combinar) no
 * operen sobre `savedItem` obsoletos.
 */
export function reconcileSavedRows<Item extends { pickingSlotId?: number; id?: string; orden?: string }, Row extends ReconcilableRow<Item>>(
  rows: Row[],
  items: Item[],
): Row[] {
  const byKey = new Map<string, Item>();
  for (const it of items) {
    const k = stableItemKey(it);
    if (k) byKey.set(k, it);
  }

  const out: Row[] = [];
  let changed = false;
  for (const row of rows) {
    // Fila en progreso: no tocar.
    if (!row.saved || !row.savedItem) {
      out.push(row);
      continue;
    }
    const key = stableItemKey({
      pickingSlotId: row.pickingSlotId ?? row.savedItem.pickingSlotId,
      id: row.savedItem.id,
      orden: row.savedItem.orden,
    });
    const fresh = key ? byKey.get(key) : undefined;
    if (fresh) {
      if (fresh === row.savedItem) {
        out.push(row); // ya apunta a la referencia vigente
      } else {
        // Refrescar la referencia embebida (orden/peso nuevos) sin perder el id de fila.
        out.push({ ...row, savedItem: fresh });
        changed = true;
      }
    } else if (!key) {
      // Sin id estable para emparejar → conservar (no perder datos del usuario).
      out.push(row);
    } else {
      // El item ya no existe en el contexto → la fila guardada ya no aplica: descartar.
      changed = true;
    }
  }
  // Devolver el mismo array si nada cambió, para no forzar re-render en efectos.
  return changed ? out : rows;
}

/**
 * Encuentra el item de contexto que corresponde a una fila (por id estable), para que las
 * acciones de suma/combinación no dependan de pkg+orden (que cambia con renumberItems).
 * Devuelve `undefined` si no hay match (el llamador debe avisar, no quedarse en silencio).
 */
export function findItemForRow<Item extends { pickingSlotId?: number; id?: string; orden?: string }>(
  items: Item[],
  row: { pickingSlotId?: number; savedItem?: Item },
): Item | undefined {
  if (!row.savedItem) return undefined;
  const key = stableItemKey({
    pickingSlotId: row.pickingSlotId ?? row.savedItem.pickingSlotId,
    id: row.savedItem.id,
    orden: row.savedItem.orden,
  });
  if (!key) return undefined;
  return items.find(it => stableItemKey(it) === key);
}

/** ¿Dos items son el mismo, usando el id estable? (reemplaza el frágil pkg+orden). */
export function sameStableItem(
  a: { pickingSlotId?: number; id?: string; orden?: string },
  b?: { pickingSlotId?: number; id?: string; orden?: string },
): boolean {
  if (!b) return false;
  const ka = stableItemKey(a);
  const kb = stableItemKey(b);
  return ka !== '' && ka === kb;
}
