import { supabase } from './supabase';

export type CountMap = Record<string, { p: number; b: number; c: number; ch: number }>;

export interface SesionRow {
  fecha: string;
  fuente: string;
  tienda_cod: string;
  pallets: number;
  bultos: number;
  contenedores: number;
  chocolates: number;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Write counts for today to Supabase (upsert) and drop stale rows. Fire-and-forget.
 *
 * [P5] `conocidas` = códigos que ESTE cliente tiene en pantalla (con o sin carga). El borrado de
 * filas obsoletas se limita a ese universo. Antes se borraba TODO lo que no estuviera en `counts`,
 * así que un usuario recién entrado —cuyo estado todavía es parcial— borraba de `despacho_sesion`
 * las tiendas cargadas por sus compañeros, y el Enrutador/Manual las perdía. Sin `conocidas` no se
 * borra nada (solo se hace upsert): más vale una fila fantasma que perder carga ajena.
 */
export async function pushCounts(
  fuente: 'regiones' | 'santiago' | 'congelados-regiones' | 'congelados-santiago',
  counts: CountMap,
  conocidas?: string[],
): Promise<void> {
  const entries = Object.entries(counts);
  // Sin tiendas cargadas → no tocar nada. Evita borrar la data del día durante el arranque,
  // cuando dispatchData aún no se hidrató (guarda anti-wipe).
  if (entries.length === 0) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const fecha = todayISO();
  const rows = entries.map(([cod, vals]) => ({
    fecha,
    fuente,
    tienda_cod:   cod,
    pallets:      vals.p,
    bultos:       vals.b,
    contenedores: vals.c,
    chocolates:   vals.ch,
    updated_at:   new Date().toISOString(),
  }));

  await supabase.from('despacho_sesion').upsert(rows, {
    onConflict: 'fecha,fuente,tienda_cod',
  });

  // Mantener despacho_sesion en sync con la pantalla: borrar las filas de HOY de esta fuente
  // cuyas tiendas ya NO tienen carga (se quitaron o vaciaron). Sin esto, una tienda cargada y
  // luego retirada quedaba como "fantasma" en el Manual/Enrutador (upsert nunca borra).
  // El borrado se limita a las tiendas que ESTE cliente conoce (ver `conocidas` arriba).
  if (!conocidas?.length) return;
  const conCarga = new Set(entries.map(([cod]) => cod));
  const vaciadas = [...new Set(conocidas)].filter(cod => cod && !conCarga.has(cod));
  if (!vaciadas.length) return;
  try {
    await supabase.from('despacho_sesion')
      .delete()
      .eq('fecha', fecha)
      .eq('fuente', fuente)
      .in('tienda_cod', vaciadas);
  } catch { /* fire-and-forget: un fallo al limpiar no debe romper el guardado */ }
}

/** Fetch all counts for a given date. */
export async function fetchCounts(fecha: string): Promise<SesionRow[]> {
  const { data } = await supabase
    .from('despacho_sesion')
    .select('fecha,fuente,tienda_cod,pallets,bultos,contenedores,chocolates')
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
