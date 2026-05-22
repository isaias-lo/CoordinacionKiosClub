-- Shared picker state: names and unit types visible across all supervisor desktops in real time
-- One row per (state_key, date). UPSERT on change, Realtime broadcasts to all clients.
CREATE TABLE IF NOT EXISTS picking_session_state (
  state_key    text        NOT NULL,
  date         date        NOT NULL DEFAULT CURRENT_DATE,
  picker_label text        NOT NULL DEFAULT '',
  tipo         text        NOT NULL DEFAULT 'P',
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state_key, date)
);

CREATE INDEX IF NOT EXISTS picking_session_state_date ON picking_session_state(date);

ALTER TABLE picking_session_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picking_session_state_auth"
  ON picking_session_state FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE picking_session_state;
