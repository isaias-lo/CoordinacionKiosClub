import { supabase } from '@/lib/supabase';
import { clasificarContenido, tipoDesdePicking, type ClaseContenido } from './contenidoCarga';

/**
 * El tipo de carga que marcó Picking para un slot, o `null` si el slot lo creó Bodega (o no se
 * pudo leer). Lo usa el Resumen, que no tiene los slots a mano: con un tipo de Picking el editor
 * lo muestra bloqueado, igual que la tarjeta. Si la lectura falla, se deja editar: es lo de antes.
 */
export async function tipoBloqueadoDeSlot(slotId?: number | null): Promise<ClaseContenido | null> {
  if (!slotId) return null;
  const { data } = await supabase.from('picking_pallets')
    .select('picker_label, contenido').eq('id', slotId).maybeSingle();
  if (!data || !tipoDesdePicking(data)) return null;
  return clasificarContenido(data.contenido as string | null);
}
