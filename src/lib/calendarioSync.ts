import { supabase } from './supabase';

// Inline type — mirrors CalendarioCompleto from useCalendario.ts (no circular dep)
export type CalSyncRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

const ROW_ID = 'current';

/** Upsert the full calendar to Supabase. Fire-and-forget safe (caller should .catch). */
export async function pushCalendario(cal: CalSyncRecord, userId?: string): Promise<void> {
  const { error } = await supabase
    .from('calendario_central')
    .upsert(
      {
        id:         ROW_ID,
        data:       cal,
        updated_at: new Date().toISOString(),
        ...(userId ? { updated_by: userId } : {}),
      },
      { onConflict: 'id' }
    );
  if (error) console.error('[calendarioSync:push]', error.message);
}

/** Upsert the full calendar to Supabase. Throws on error (use for primary blocking saves). */
export async function saveCalendario(cal: CalSyncRecord, userId?: string): Promise<void> {
  const { error } = await supabase
    .from('calendario_central')
    .upsert(
      {
        id:         ROW_ID,
        data:       cal,
        updated_at: new Date().toISOString(),
        ...(userId ? { updated_by: userId } : {}),
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(error.message);
}

/** Fetch the current calendar from Supabase. Returns null if not found or on error. */
export async function fetchCalendarioSupa(): Promise<CalSyncRecord | null> {
  const { data, error } = await supabase
    .from('calendario_central')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) console.error('[calendarioSync:fetch]', error.message);
  return (data?.data as CalSyncRecord) ?? null;
}

/**
 * Subscribe to real-time calendar changes from any device.
 * Returns an unsubscribe function.
 */
export function subscribeToCalendarioSupa(
  onCal: (cal: CalSyncRecord) => void
): () => void {
  const channel = supabase
    .channel(`calendario-central-${Math.random().toString(36).slice(2, 7)}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'calendario_central',
        filter: `id=eq.${ROW_ID}`,
      },
      (payload) => {
        const row = payload.new as { data?: CalSyncRecord } | null;
        if (row?.data) onCal(row.data);
      }
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
