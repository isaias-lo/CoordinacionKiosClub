ALTER TABLE despacho_rm
  ADD COLUMN IF NOT EXISTS pioneta_1 text,
  ADD COLUMN IF NOT EXISTS pioneta_2 text;

ALTER TABLE despacho_regiones
  ADD COLUMN IF NOT EXISTS pioneta_1 text,
  ADD COLUMN IF NOT EXISTS pioneta_2 text;
