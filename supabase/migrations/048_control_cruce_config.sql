-- Tabla de configuración para la exportación automática de Control Cruce
CREATE TABLE IF NOT EXISTS control_cruce_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE control_cruce_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read write"
  ON control_cruce_config
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Fila por defecto: exportación a las 07:00 Santiago, habilitada
INSERT INTO control_cruce_config (key, value) VALUES (
  'auto_export',
  '{"hora": "07:00", "habilitado": true, "ultima_fecha": null}'
) ON CONFLICT (key) DO NOTHING;
