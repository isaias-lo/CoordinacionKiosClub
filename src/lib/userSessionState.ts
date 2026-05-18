import { supabase } from './supabase';

type Fuente = 'regiones' | 'santiago';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function pushSessionState(fuente: Fuente, state: unknown): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from('user_session_state').upsert(
    {
      user_id:    session.user.id,
      fecha:      todayISO(),
      fuente,
      state,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,fecha,fuente' },
  );
}

export async function fetchSessionState(fuente: Fuente): Promise<unknown | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data } = await supabase
    .from('user_session_state')
    .select('state')
    .eq('user_id', session.user.id)
    .eq('fecha', todayISO())
    .eq('fuente', fuente)
    .maybeSingle();

  return data?.state ?? null;
}

export function subscribeToSessionState(
  fuente: Fuente,
  userId: string,
  onState: (state: unknown) => void,
): () => void {
  const fecha = todayISO();
  const channel = supabase
    .channel(`session-state-${fuente}-${userId}-${fecha}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_session_state',
        filter: `user_id=eq.${userId}`,
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
