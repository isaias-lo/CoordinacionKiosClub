import { supabase } from '@/lib/supabase';

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
  supabase.from('picking_pallets').delete().eq('id', slotId).then(({ error }) => {
    if (error) console.error('[eliminarSlotPicking]', error.message);
  });
}
