-- Feedback del asistente IA de asignación: guarda lo que la IA propuso vs la asignación final que
-- usó el coordinador, y cuál eligió. Es el corpus de aprendizaje: el historyFetcher prioriza los
-- días con feedback (los ajustes reales) para mejorar las próximas propuestas.
CREATE TABLE IF NOT EXISTS ia_asignacion_feedback (
  id           bigserial PRIMARY KEY,
  fecha        text NOT NULL,                    -- YYYY-MM-DD (igual que shared_session_state)
  fuente       text NOT NULL DEFAULT 'despacho', -- 'despacho' | 'segunda_vuelta'
  propuesta_ia jsonb,                            -- { patente: [cods] } que propuso la IA (null si no hubo)
  final        jsonb NOT NULL,                   -- { patente: [cods] } que se usó finalmente
  elegida      text NOT NULL,                    -- 'ia' | 'mia' | 'gps'
  edit_count   int  NOT NULL DEFAULT 0,          -- nº de tiendas movidas respecto a la propuesta IA
  supervisor   text,
  usuario_id   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_feedback_fecha   ON ia_asignacion_feedback(fecha);
CREATE INDEX IF NOT EXISTS idx_ia_feedback_created ON ia_asignacion_feedback(created_at);

ALTER TABLE ia_asignacion_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de feedback IA"
  ON ia_asignacion_feedback FOR SELECT USING (true);

CREATE POLICY "Inserción autenticada o anónima"
  ON ia_asignacion_feedback FOR INSERT WITH CHECK (true);
