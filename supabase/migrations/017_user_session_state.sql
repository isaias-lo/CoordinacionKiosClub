CREATE TABLE IF NOT EXISTS public.user_session_state (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fecha      date        NOT NULL DEFAULT CURRENT_DATE,
  fuente     text        NOT NULL CHECK (fuente IN ('regiones', 'santiago')),
  state      jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fecha, fuente)
);

ALTER TABLE public.user_session_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_state_own_rows" ON public.user_session_state
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_session_state;
