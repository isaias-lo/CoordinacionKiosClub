-- Tabla principal para historial de despachos registrados desde el Enrutador
CREATE TABLE IF NOT EXISTS historial_despacho (
  id             bigserial    PRIMARY KEY,
  fecha          date         NOT NULL,
  supervisor     text         NOT NULL DEFAULT '',
  total_tiendas  integer      NOT NULL DEFAULT 0,
  total_pallets  integer      NOT NULL DEFAULT 0,
  total_bultos   integer      NOT NULL DEFAULT 0,
  total_rutas    integer      NOT NULL DEFAULT 0,
  km_total       numeric(8,1) NOT NULL DEFAULT 0,
  resumen        jsonb,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historial_despacho_fecha ON historial_despacho(fecha DESC);

ALTER TABLE historial_despacho ENABLE ROW LEVEL SECURITY;

-- Lectura: usuarios autenticados del sistema
CREATE POLICY "Lectura autenticada historial_despacho"
  ON historial_despacho FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserción: service role (API routes) — no necesita policy, usa service key
