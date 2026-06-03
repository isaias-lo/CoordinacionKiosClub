-- ============================================================
-- 038 — FK picking_pallet_id en despacho_rm y despacho_regiones
-- Permite trazar cada registro de despacho hasta el slot físico
-- de picking que lo originó.
-- Nullable: despachos de emergencia sin Picking siguen funcionando.
-- ============================================================

ALTER TABLE despacho_rm
  ADD COLUMN IF NOT EXISTS picking_pallet_id INTEGER;

ALTER TABLE despacho_rm
  DROP CONSTRAINT IF EXISTS despacho_rm_picking_pallet_id_fkey;
ALTER TABLE despacho_rm
  ADD CONSTRAINT despacho_rm_picking_pallet_id_fkey
  FOREIGN KEY (picking_pallet_id)
  REFERENCES picking_pallets(id)
  ON DELETE SET NULL;

ALTER TABLE despacho_regiones
  ADD COLUMN IF NOT EXISTS picking_pallet_id INTEGER;

ALTER TABLE despacho_regiones
  DROP CONSTRAINT IF EXISTS despacho_regiones_picking_pallet_id_fkey;
ALTER TABLE despacho_regiones
  ADD CONSTRAINT despacho_regiones_picking_pallet_id_fkey
  FOREIGN KEY (picking_pallet_id)
  REFERENCES picking_pallets(id)
  ON DELETE SET NULL;

-- Índices para lookup inverso: dado un picking_pallet_id,
-- encontrar rápidamente sus filas de despacho
CREATE INDEX IF NOT EXISTS despacho_rm_picking_pallet_idx
  ON despacho_rm (picking_pallet_id)
  WHERE picking_pallet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS despacho_regiones_picking_pallet_idx
  ON despacho_regiones (picking_pallet_id)
  WHERE picking_pallet_id IS NOT NULL;
