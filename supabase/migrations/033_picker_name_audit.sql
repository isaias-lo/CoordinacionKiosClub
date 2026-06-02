-- Agrega auditoría a picker_canonical_names y tabla de historial de cambios

ALTER TABLE picker_canonical_names
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- Historial de cambios de nombre de pickers
CREATE TABLE IF NOT EXISTS picker_name_changes (
  id              BIGSERIAL PRIMARY KEY,
  picker_key      TEXT        NOT NULL,
  old_name        TEXT        NOT NULL DEFAULT '',
  new_name        TEXT        NOT NULL DEFAULT '',
  changed_by_name TEXT        NOT NULL DEFAULT '',
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE picker_name_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picker_name_changes_read"
  ON picker_name_changes FOR SELECT TO authenticated USING (true);

CREATE POLICY "picker_name_changes_insert"
  ON picker_name_changes FOR INSERT TO authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE picker_name_changes;
