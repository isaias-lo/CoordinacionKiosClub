-- Individual pallet slots for real-time multi-supervisor picking
-- Each row = one pallet assignment. pallet_num = chronological rank within (date, store_cod).
CREATE TABLE IF NOT EXISTS picking_pallets (
  id           bigserial     PRIMARY KEY,
  date         date          NOT NULL DEFAULT CURRENT_DATE,
  store_cod    text          NOT NULL,
  state_key    text          NOT NULL,
  picker_label text          NOT NULL DEFAULT '',
  tipo         text          NOT NULL DEFAULT 'P',
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS picking_pallets_date_store ON picking_pallets(date, store_cod);

ALTER TABLE picking_pallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "picking_pallets_auth"
  ON picking_pallets FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE picking_pallets;
