-- Track which picker groups have been printed (for cross-desktop visibility)
CREATE TABLE IF NOT EXISTS picking_prints (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  state_key    text NOT NULL,          -- e.g. "02SC__picker 5" (normalized lowercase)
  date         date NOT NULL DEFAULT CURRENT_DATE,
  printed_at   timestamptz NOT NULL DEFAULT now(),
  picker_label text,
  pallets      int NOT NULL DEFAULT 0,
  UNIQUE(state_key, date)
);

ALTER TABLE picking_prints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picking_prints_auth"
  ON picking_prints FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE picking_prints;
