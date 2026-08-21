import { supabase } from '@/lib/supabase';

// [RC-3] Ids de slots recién borrados (con TTL). La recarga de picking (load) los FILTRA para
// que un borrado no "reviva": el canal de picking recarga la tabla completa con debounce 600 ms,
// y si ese reload llega antes de que el DELETE propague, re-insertaría el slot recién borrado
// (→ el backfill lo vuelve a materializar). Se limpia solo tras un margen de propagación.
const recienBorrados = new Set<number>();
const TTL_MS = 5000;

/** ¿El slot fue borrado hace muy poco? (para que `load` no lo re-inserte). */
export function fueRecienBorrado(id: number): boolean {
  return recienBorrados.has(id);
}

/** Marca un id como recién borrado (auto-expira). Lo llama `eliminarSlotPicking`. */
export function marcarRecienBorrado(id: number): void {
  recienBorrados.add(id);
  setTimeout(() => recienBorrados.delete(id), TTL_MS);
}

/**
 * Borra el slot de `picking_pallets` vinculado a un ítem de Bodega.
 *
 * Causa raíz de "borro un pallet/CH en el Resumen y reaparece": el panel Resumen quitaba el
 * ítem del estado (`DELETE_ITEM`) pero NUNCA borraba el slot de `picking_pallets`, así que
 * seguía `is_active=true` y la reconstrucción/backfill del formulario lo volvía a materializar.
 * El formulario (deleteSavedRow) sí borra el slot; el Resumen no lo hacía. Este helper unifica
 * ese borrado para reusarlo desde ambos Resumen (RM/Costa y Nacional).
 *
 * Fire-and-forget (no bloquea la UI). El trigger AFTER DELETE en la tabla registra el evento
 * 'eliminar' para la auditoría. Sin `slotId` (ítems manuales sin slot) es un no-op seguro.
 */
export function eliminarSlotPicking(slotId?: number | null): void {
  if (!slotId) return;
  marcarRecienBorrado(slotId); // guard anti-revive contra la recarga de picking (RC-3)
  supabase.from('picking_pallets').delete().eq('id', slotId).then(({ error }) => {
    if (error) console.error('[eliminarSlotPicking]', error.message);
  });
}
