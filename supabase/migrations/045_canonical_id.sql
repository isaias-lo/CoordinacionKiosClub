ALTER TABLE despacho_rm
  ADD COLUMN IF NOT EXISTS canonical_id text;

ALTER TABLE despacho_regiones
  ADD COLUMN IF NOT EXISTS canonical_id text;
