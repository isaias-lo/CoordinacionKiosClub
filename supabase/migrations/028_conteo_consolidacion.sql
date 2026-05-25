-- Conteo y consolidación de bultos por tienda, conectado al picking.
-- Una fila por (date, store_cod) — se upsertea cuando el operador registra peso/alto/notas.
CREATE TABLE IF NOT EXISTS conteo_consolidacion (
  id          bigserial    PRIMARY KEY,
  date        date         NOT NULL DEFAULT CURRENT_DATE,
  store_cod   text         NOT NULL,
  zona        text         NOT NULL,                       -- 'nacional' | 'rm_costa'
  peso_kg     numeric,
  alto_cm     numeric,
  notas       text,
  estado      text         NOT NULL DEFAULT 'pendiente',  -- 'pendiente' | 'consolidado' | 'despachado'
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by  uuid         REFERENCES auth.users(id),
  UNIQUE(date, store_cod)
);

ALTER TABLE conteo_consolidacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conteo_auth"
  ON conteo_consolidacion FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE conteo_consolidacion;
