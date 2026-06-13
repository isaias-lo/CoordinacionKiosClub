-- Fecha de armado (cuándo se cargó en Bodega) y número de vuelta
ALTER TABLE despacho_rm
  ADD COLUMN IF NOT EXISTS fecha_armado  date,
  ADD COLUMN IF NOT EXISTS vuelta        smallint NOT NULL DEFAULT 1;

ALTER TABLE despacho_regiones
  ADD COLUMN IF NOT EXISTS fecha_armado  date,
  ADD COLUMN IF NOT EXISTS vuelta        smallint NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_despacho_rm_vuelta
  ON despacho_rm (fecha, cod, vuelta);
CREATE INDEX IF NOT EXISTS idx_despacho_regiones_vuelta
  ON despacho_regiones (fecha, cod, vuelta);
CREATE INDEX IF NOT EXISTS idx_despacho_rm_armado
  ON despacho_rm (fecha_armado);
CREATE INDEX IF NOT EXISTS idx_despacho_regiones_armado
  ON despacho_regiones (fecha_armado);
