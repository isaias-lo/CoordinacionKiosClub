CREATE TABLE IF NOT EXISTS public.shared_session_state (
  fecha      date        NOT NULL DEFAULT CURRENT_DATE,
  fuente     text        NOT NULL CHECK (fuente IN ('regiones', 'santiago')),
  state      jsonb       NOT NULL DEFAULT '{}',
  updated_by uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, fuente)
);

ALTER TABLE public.shared_session_state ENABLE ROW LEVEL SECURITY;

-- Todos los usuarios autenticados pueden leer y escribir
CREATE POLICY "shared_state_read" ON public.shared_session_state
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "shared_state_write" ON public.shared_session_state
  FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

ALTER PUBLICATION supabase_realtime ADD TABLE public.shared_session_state;
