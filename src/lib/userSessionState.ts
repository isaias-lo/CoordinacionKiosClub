import { supabase } from './supabase';

type Fuente = 'regiones' | 'santiago' | 'guides' | 'rutas' | 'segunda_vuelta';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Upsert the shared state for today (all authenticated users share the same row per fuente). */
export async function pushSessionState(fuente: Fuente, state: unknown, userId?: string): Promise<void> {
  const payload: Record<string, unknown> = {
    fecha:      todayISO(),
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

/** Fetch today's shared state. Any authenticated user can read. */
export async function fetchSessionState(fuente: Fuente): Promise<unknown | null> {
  const { data, error } = await supabase
    .from('shared_session_state')
    .select('state')
    .eq('fecha', todayISO())
    .eq('fuente', fuente)
    .maybeSingle();

  if (error) console.error('[sync:fetch]', fuente, error.message);
  return data?.state ?? null;
}

/**
 * Subscribe to real-time changes on the shared state.
 * All users (including other people) trigger this callback when they push changes.
 */
export function subscribeToSessionState(
  fuente: Fuente,
  _userId: string,
  onState: (state: unknown) => void,
): () => void {
  const fecha = todayISO();
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
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
