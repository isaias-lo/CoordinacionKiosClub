-- Central dispatch calendar shared across all devices in real time.
-- One row per environment (id = 'current'), data column holds full weekly schedule.
CREATE TABLE IF NOT EXISTS calendario_central (
  id         text        PRIMARY KEY,
  data       jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid        REFERENCES auth.users(id)
);

ALTER TABLE calendario_central ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendario_central_auth"
  ON calendario_central FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE calendario_central;
