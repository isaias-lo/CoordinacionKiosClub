import { supabase } from './supabase';

// Mismo shape que calendario_central / calendario_armado.
export type CalRecord = Record<string, { rm: string[]; costa: string[]; fal: string[] }>;

const ROW_ID = 'current';
const DIAS = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];

function calendarioVacio(): CalRecord {
  const cal: CalRecord = {};
  for (const dia of DIAS) cal[dia] = { rm: [], costa: [], fal: [] };
  return cal;
}

/**
 * Fetch del Calendario de Congelados. A diferencia de calendario_armado, NO cae al
 * Calendario de Abastecimiento si no hay fila guardada — es un calendario independiente
 * que arranca vacío (una tienda no debería aparecer "pre-cargada" en Congelados solo
 * porque está en Abastecimiento).
 */
export async function fetchCalendarioCongelados(): Promise<CalRecord> {
  const { data, error } = await supabase
    .from('calendario_congelados')
    .select('data')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) console.error('[calendarioCongelados:fetch]', error.message);
  return (data?.data as CalRecord) ?? calendarioVacio();
}

export async function saveCalendarioCongelados(cal: CalRecord, userId?: string): Promise<void> {
  const { error } = await supabase
    .from('calendario_congelados')
    .upsert(
      { id: ROW_ID, data: cal, updated_at: new Date().toISOString(), ...(userId ? { updated_by: userId } : {}) },
      { onConflict: 'id' }
    );
  if (error) throw new Error(error.message);
}

export function subscribeToCalendarioCongelados(onCal: (cal: CalRecord) => void): () => void {
  const channel = supabase
    .channel(`calendario-congelados-${Math.random().toString(36).slice(2, 7)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_congelados', filter: `id=eq.${ROW_ID}` },
      (payload) => {
        const row = payload.new as { data?: CalRecord } | null;
        if (row?.data) onCal(row.data);
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
