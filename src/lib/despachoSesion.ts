import { supabase } from './supabase';

export type CountMap = Record<string, { p: number; b: number }>;

export interface SesionRow {
  fecha: string;
  fuente: string;
  tienda_cod: string;
  pallets: number;
  bultos: number;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Write counts for today to Supabase (upsert). Fire-and-forget. */
export async function pushCounts(fuente: 'regiones' | 'santiago', counts: CountMap): Promise<void> {
  const entries = Object.entries(counts);
  if (entries.length === 0) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const fecha = todayISO();
  const rows = entries.map(([cod, vals]) => ({
    fecha,
    fuente,
    tienda_cod: cod,
    pallets:    vals.p,
    bultos:     vals.b,
    updated_at: new Date().toISOString(),
  }));

  await supabase.from('despacho_sesion').upsert(rows, {
    onConflict: 'fecha,fuente,tienda_cod',
  });
}

/** Fetch all counts for a given date. */
export async function fetchCounts(fecha: string): Promise<SesionRow[]> {
  const { data } = await supabase
    .from('despacho_sesion')
    .select('fecha,fuente,tienda_cod,pallets,bultos')
    .eq('fecha', fecha);
  return (data ?? []) as SesionRow[];
}

/**
 * Subscribe to INSERT/UPDATE on despacho_sesion for a given date.
 * Returns a cleanup function to unsubscribe.
 */
export function subscribeToSesion(
  fecha: string,
  onRow: (row: SesionRow) => void,
): () => void {
  const channel = supabase
    .channel(`despacho-sesion-${fecha}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'despacho_sesion', filter: `fecha=eq.${fecha}` },
      (payload) => onRow(payload.new as SesionRow),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'despacho_sesion', filter: `fecha=eq.${fecha}` },
      (payload) => onRow(payload.new as SesionRow),
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
