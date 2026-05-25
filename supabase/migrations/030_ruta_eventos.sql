-- Eventos de trazabilidad por ruta de despacho
CREATE TABLE IF NOT EXISTS ruta_eventos (
  id         bigserial PRIMARY KEY,
  ruta_id    bigint NOT NULL REFERENCES rutas_despacho(id) ON DELETE CASCADE,
  tipo       text NOT NULL,  -- salida | qr_scan | entrega | recepcion | incidencia
  usuario_id uuid REFERENCES auth.users(id),
  datos      jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ruta_eventos_ruta_id  ON ruta_eventos(ruta_id);
CREATE INDEX IF NOT EXISTS idx_ruta_eventos_tipo      ON ruta_eventos(tipo);
CREATE INDEX IF NOT EXISTS idx_ruta_eventos_created   ON ruta_eventos(created_at);

ALTER TABLE ruta_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de eventos"
  ON ruta_eventos FOR SELECT USING (true);

CREATE POLICY "Inserción autenticada o anónima"
  ON ruta_eventos FOR INSERT WITH CHECK (true);

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE ruta_eventos;
