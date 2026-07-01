import { supabase } from './supabase';

// 'rutas_reg' = marca de "este día ya se registró en el Enrutador" (para avisar de días sin registrar).
type Fuente = 'regiones' | 'santiago' | 'guides' | 'rutas' | 'segunda_vuelta' | 'rutas_reg';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Upsert the shared state for a date (default = today). Todos los usuarios comparten la misma
 * fila por (fecha, fuente). `fecha` permite operar sobre un día pasado (p. ej. registrar en el
 * Enrutador una fecha que quedó sin registrar).
 */
export async function pushSessionState(fuente: Fuente, state: unknown, userId?: string, fecha: string = todayISO()): Promise<void> {
  const payload: Record<string, unknown> = {
    fecha,
    fuente,
    state,
    updated_at: new Date().toISOString(),
  };
  if (userId) payload.updated_by = userId;

  const { error } = await supabase
    .from('shared_session_state')
    .upsert(payload, { onConflict: 'fecha,fuente' });

  if (error) console.error('[sync:push]', fuente, error.message, error.details);
}

/** Fetch the shared state for a date (default = today). Any authenticated user can read. */
export async function fetchSessionState(fuente: Fuente, fecha: string = todayISO()): Promise<unknown | null> {
  const { data, error } = await supabase
    .from('shared_session_state')
    .select('state')
    .eq('fecha', fecha)
    .eq('fuente', fuente)
    .maybeSingle();

  if (error) console.error('[sync:fetch]', fuente, error.message);
  return data?.state ?? null;
}

/**
 * Devuelve los días PASADOS (últimos `sinceDays`) que tienen asignaciones en el Enrutador
 * (`fuente='rutas'` con al menos una tienda) pero NO fueron registrados (`fuente='rutas_reg'`
 * ausente). Sirve para avisar "quedó sin registrar el día X" al abrir un día nuevo.
 */
export async function fetchUnregisteredRutasDays(sinceDays = 10): Promise<string[]> {
  const today = todayISO();
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);
  const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('shared_session_state')
    .select('fecha, fuente, state')
    .in('fuente', ['rutas', 'rutas_reg'])
    .gte('fecha', sinceISO)
    .lt('fecha', today); // solo días pasados

  if (error) { console.error('[sync:unregistered]', error.message); return []; }
  return computeUnregisteredDays((data ?? []) as SessionStateRow[]);
}

export interface SessionStateRow { fecha: string; fuente: string; state: unknown }

/**
 * Lógica pura: de filas (rutas + rutas_reg), devuelve los días con asignaciones no vacías
 * (`fuente='rutas'`) que NO tienen marca de registro (`fuente='rutas_reg'`). Más reciente primero.
 */
export function computeUnregisteredDays(rows: SessionStateRow[]): string[] {
  const asignByDate = new Map<string, unknown>();
  const registered  = new Set<string>();
  for (const r of rows) {
    if (r.fuente === 'rutas_reg') registered.add(r.fecha);
    else if (r.fuente === 'rutas') asignByDate.set(r.fecha, r.state);
  }
  const hasAssignments = (state: unknown) =>
    !!state && typeof state === 'object' &&
    Object.values(state as Record<string, unknown>).some(v => Array.isArray(v) && v.length > 0);

  const result: string[] = [];
  for (const [fecha, state] of asignByDate) {
    if (!registered.has(fecha) && hasAssignments(state)) result.push(fecha);
  }
  return result.sort().reverse(); // más reciente primero
}

/**
 * Subscribe to real-time changes on the shared state.
 * All users (including other people) trigger this callback when they push changes.
 *
 * @param onStatus  Optional. Reports WebSocket connection health (true = SUBSCRIBED).
 *                  Used by callers to skip the polling fallback while Realtime is live,
 *                  which avoids re-downloading the full state blob every few seconds (egress).
 */
export function subscribeToSessionState(
  fuente: Fuente,
  _userId: string,
  onState: (state: unknown) => void,
  onStatus?: (connected: boolean) => void,
  fecha: string = todayISO(),
): () => void {
  const channelId = `shared-state-${fuente}-${fecha}-${Math.random().toString(36).slice(2, 7)}`;
  // Supabase Realtime solo admite UNA condición de filtro por suscripción.
  // Filtramos por `fuente` en el servidor y validamos `fecha`/`fuente` en el
  // callback (un filtro multi-condición con coma es inválido y dejaba pasar
  // eventos de otras fuentes → cross-contaminación de estado entre vistas).
  const channel = supabase
    .channel(channelId)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_session_state', filter: `fuente=eq.${fuente}` },
      (payload) => {
        const row = payload.new as { state?: unknown; fecha?: string; fuente?: string } | null;
        if (!row) return;
        if (row.fecha !== fecha || row.fuente !== fuente) return; // solo hoy + esta fuente
        if (row.state) onState(row.state);
      },
    )
    .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));

  return () => { supabase.removeChannel(channel); };
}
