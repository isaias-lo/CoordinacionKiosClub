import { supabase } from './supabase';

type Fuente = 'regiones' | 'santiago';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Upsert the shared state for today (all authenticated users share the same row per fuente). */
export async function pushSessionState(fuente: Fuente, state: unknown): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from('shared_session_state').upsert(
    {
      fecha:      todayISO(),
      fuente,
      state,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fecha,fuente' },
  );
}

/** Fetch today's shared state. Any authenticated user can read. */
export async function fetchSessionState(fuente: Fuente): Promise<unknown | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('shared_session_state')
    .select('state')
    .eq('fecha', todayISO())
    .eq('fuente', fuente)
    .maybeSingle();

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
  const channel = supabase
    .channel(`shared-state-${fuente}-${fecha}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table:  'shared_session_state',
        filter: `fuente=eq.${fuente}`,
      },
      (payload) => {
        const row = payload.new as { fecha: string; fuente: string; state: unknown } | null;
        if (row?.fecha === fecha && row?.fuente === fuente) {
          onState(row.state);
        }
      },
    )
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
