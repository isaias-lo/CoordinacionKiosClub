-- Persistent canonical picker name mappings shared across all supervisor desktops
-- e.g. "Pickers 5" → "Carlos Ramos"
CREATE TABLE IF NOT EXISTS picker_canonical_names (
  key          text PRIMARY KEY,
  display_name text NOT NULL DEFAULT ''
);

ALTER TABLE picker_canonical_names ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picker_canonical_names_auth"
  ON picker_canonical_names FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE picker_canonical_names;
