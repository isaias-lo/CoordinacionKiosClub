// Carga lo que pasó en picking un día cualquiera (Actividad e Historial de días anteriores).
// Para hoy se usan los datos en vivo que ya tiene PickingScreen.

import { supabase } from '@/lib/supabase';
import type { PrintRecord, PickerNameChange, PalletSlot } from '../picking-types';
import type { PickingEvento } from '../picking-utils';

export interface ActivityData {
  printRecords: PrintRecord[];
  nameChanges:  PickerNameChange[];
  palletSlots:  PalletSlot[];
  eventos:      PickingEvento[];
}

/** YYYY-MM-DD desplazado `n` días (mediodía UTC para evitar bordes de DST). */
export function shiftDate(date: string, n: number): string {
  return new Date(new Date(date + 'T12:00:00Z').getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Carga la actividad persistida de una fecha. */
export async function fetchActivity(date: string): Promise<ActivityData> {
  const [prints, evts, pallets, names] = await Promise.all([
    supabase.from('picking_prints')
      .select('state_key, printed_at, picker_label, pallets, tipo, printed_by_name, print_count, batch')
      .eq('date', date).order('printed_at', { ascending: true }),
    supabase.from('picking_eventos')
      .select('id, date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, created_at')
      .eq('date', date).order('created_at', { ascending: true }),
    supabase.from('picking_pallets')
      .select('id, store_cod, state_key, picker_label, tipo, contenido, refs, created_at, seq, canonical_id')
      .eq('date', date).eq('is_active', true).order('created_at', { ascending: true }),
    // picker_name_changes no tiene columna `date`: filtramos por día UTC, igual que
    // el resto del módulo de Picking (las columnas `date` se escriben con todayISO UTC).
    supabase.from('picker_name_changes')
      .select('id, picker_key, old_name, new_name, changed_by_name, changed_at')
      .gte('changed_at', `${date}T00:00:00.000Z`)
      .lte('changed_at', `${date}T23:59:59.999Z`)
      .order('changed_at', { ascending: false }),
  ]);

  const palletSlots = ((pallets.data ?? []) as PalletSlot[])
    .filter(s => !String(s.state_key ?? '').endsWith('__bodega') && s.picker_label !== 'Bodega');

  return {
    printRecords: (prints.data ?? []) as PrintRecord[],
    eventos:      (evts.data ?? []) as PickingEvento[],
    palletSlots,
    nameChanges:  (names.data ?? []) as PickerNameChange[],
  };
}

