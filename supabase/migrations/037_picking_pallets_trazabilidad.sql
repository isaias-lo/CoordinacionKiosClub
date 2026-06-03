-- ============================================================
-- 037 — Trazabilidad completa por ID desde Picking
-- Extiende picking_pallets para ser la llave permanente
-- que recorre todo el flujo: Picking → Bodega → Enrutador
-- ============================================================

-- ── Identificación semántica ─────────────────────────────────
-- seq:          posición consecutiva dentro de (date, store_cod, tipo)
--               se asigna al imprimir la etiqueta, nunca cambia
-- canonical_id: código legible P2{cod}{stamp}P, guardado al imprimir
ALTER TABLE picking_pallets
  ADD COLUMN IF NOT EXISTS seq          INTEGER,
  ADD COLUMN IF NOT EXISTS canonical_id TEXT;

-- ── Dimensiones y peso (ingresados en Bodega) ─────────────────
ALTER TABLE picking_pallets
  ADD COLUMN IF NOT EXISTS peso_kg NUMERIC,
  ADD COLUMN IF NOT EXISTS alto    INTEGER,
  ADD COLUMN IF NOT EXISTS largo   INTEGER,
  ADD COLUMN IF NOT EXISTS ancho   INTEGER,
  ADD COLUMN IF NOT EXISTS peso_v  NUMERIC,
  ADD COLUMN IF NOT EXISTS estado  TEXT DEFAULT 'Listo para despachar';

-- ── Routing (llenado por el Enrutador al registrar despacho) ──
ALTER TABLE picking_pallets
  ADD COLUMN IF NOT EXISTS conductor TEXT,
  ADD COLUMN IF NOT EXISTS patente   TEXT,
  ADD COLUMN IF NOT EXISTS ruta      TEXT,
  ADD COLUMN IF NOT EXISTS supervisor TEXT;

-- ── Control de combinaciones ──────────────────────────────────
-- is_active:     false cuando el slot fue combinado con otro
-- combined_into: id del nuevo slot que absorbió a este
-- combined_at:   timestamp de la combinación
ALTER TABLE picking_pallets
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS combined_into INTEGER,
  ADD COLUMN IF NOT EXISTS combined_at   TIMESTAMPTZ;

-- FK a sí misma (integridad al combinar)
ALTER TABLE picking_pallets
  DROP CONSTRAINT IF EXISTS picking_pallets_combined_into_fkey;
ALTER TABLE picking_pallets
  ADD CONSTRAINT picking_pallets_combined_into_fkey
  FOREIGN KEY (combined_into) REFERENCES picking_pallets(id);

-- ── Unicidad de seq por tienda+tipo+fecha (solo activos) ──────
-- Garantiza que no haya dos P2 activos para la misma tienda en el mismo día
DROP INDEX IF EXISTS picking_pallets_seq_active;
CREATE UNIQUE INDEX picking_pallets_seq_active
  ON picking_pallets (date, store_cod, tipo, seq)
  WHERE is_active = true AND seq IS NOT NULL;

-- ── Índice para buscar slots activos de una tienda ────────────
CREATE INDEX IF NOT EXISTS picking_pallets_active_store
  ON picking_pallets (date, store_cod, is_active)
  WHERE is_active = true;
