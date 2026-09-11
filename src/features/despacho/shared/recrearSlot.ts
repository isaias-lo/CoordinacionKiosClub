import { supabase } from '@/lib/supabase';
import { crearSlotBodega } from './crearSlotBodega';
import { seqRestaurable } from './deshacerSuma';
import type { PickingSlot } from '../santiago/components/PickingSlotCards';

export interface RecrearSlotInput {
  date: string;
  store_cod: string;
  tipo: string;                       // P | B | C | CH
  contenido?: string;
  /** Número que tenía antes de borrarse/sumarse. Es el que va impreso en la caja. */
  seqOriginal?: number | null;
  canonicalOriginal?: string | null;
  peso?: number;
  alto?: number;
  largo?: number;
  ancho?: number;
}

export interface RecrearSlotResult {
  slot?: PickingSlot;
  /** true si volvió con su número de antes; false si tuvo que tomar uno nuevo. */
  conservoNumero: boolean;
  error?: string;
}

/**
 * Re-crea un slot de picking_pallets al revertir un borrado o una suma, devolviéndole su número
 * original cuando nadie más lo tomó.
 *
 * create-bodega siempre asigna el siguiente seq libre, así que sin esto un CH3 revertido volvía
 * como CH7 — y la card muestra el `seq` (el número impreso en la caja), con lo que el sistema
 * habría "renombrado" el bulto justo al deshacer un error.
 *
 * Para decidir si el número está libre se consulta la base, no la caché local: la caché llega por
 * realtime con retraso, y el caso que hay que evitar —otro dispositivo agregó un chocolate en esos
 * segundos y recibió el mismo número— es justo el que la caché todavía no vio.
 */
export async function recrearSlotConNumero(input: RecrearSlotInput): Promise<RecrearSlotResult> {
  const { slot, error } = await crearSlotBodega({
    date: input.date, store_cod: input.store_cod, tipo: input.tipo, contenido: input.contenido,
  });
  if (!slot) return { conservoNumero: false, error };

  let conservoNumero = false;
  if (input.canonicalOriginal && input.seqOriginal != null) {
    const { data: ocupados } = await supabase
      .from('picking_pallets')
      .select('id, tipo, seq')
      .eq('date', input.date)
      .eq('store_cod', input.store_cod)
      .eq('tipo', input.tipo)
      .eq('seq', input.seqOriginal)
      .eq('is_active', true);
    conservoNumero = seqRestaurable(input.seqOriginal, input.tipo, ocupados ?? [], slot.id);
  }

  const dims = {
    peso_kg: input.peso ?? null, alto: input.alto ?? null,
    largo: input.largo ?? null, ancho: input.ancho ?? null,
  };
  const patch = conservoNumero
    ? { ...dims, seq: input.seqOriginal, canonical_id: input.canonicalOriginal }
    : dims;
  const { error: errPatch } = await supabase.from('picking_pallets').update(patch).eq('id', slot.id);

  // Si el update falló, el slot quedó con el número y las medidas que le dio create-bodega: no se
  // puede devolver un objeto que diga otra cosa que la base.
  if (errPatch) {
    console.error('[recrearSlotConNumero]', errPatch.message);
    return { slot, conservoNumero: false, error: errPatch.message };
  }
  return {
    slot: {
      ...slot, ...dims,
      ...(conservoNumero ? { seq: input.seqOriginal ?? null, canonical_id: input.canonicalOriginal ?? null } : {}),
    },
    conservoNumero,
  };
}
