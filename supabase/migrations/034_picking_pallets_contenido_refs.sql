-- Sync migration: add contenido + refs columns that exist in production
-- but were never tracked in version control (added via dashboard).
ALTER TABLE picking_pallets
  ADD COLUMN IF NOT EXISTS contenido text NOT NULL DEFAULT 'hogar',
  ADD COLUMN IF NOT EXISTS refs      text NOT NULL DEFAULT '';

-- Fix sibling-lookup N+1 in picking-pallets GET /?id=
-- Query: .eq('state_key', x).eq('date', y) — no compound index existed
CREATE INDEX IF NOT EXISTS picking_pallets_state_date
  ON picking_pallets (state_key, date);
