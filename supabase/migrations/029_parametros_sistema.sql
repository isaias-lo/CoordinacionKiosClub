-- Tabla de parámetros del sistema (clave-valor)
CREATE TABLE IF NOT EXISTS parametros_sistema (
  clave       text PRIMARY KEY,
  valor       text NOT NULL,
  descripcion text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id)
);

-- Valores por defecto
INSERT INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('impresion_automatica', 'true',  'Imprime automáticamente original+cedible al registrar despacho'),
  ('modo_digital',         'false', 'Prioriza documentos digitales sobre físicos'),
  ('manifiesto_por_ruta',  'true',  'Genera manifiesto único por ruta en lugar de guías individuales')
ON CONFLICT (clave) DO NOTHING;

-- RLS: solo roles admin pueden escribir; todos pueden leer
ALTER TABLE parametros_sistema ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura pública de parámetros"
  ON parametros_sistema FOR SELECT USING (true);

CREATE POLICY "Solo admin escribe parámetros"
  ON parametros_sistema FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON r.id = ANY(p.roles)
      WHERE p.id = auth.uid() AND r.name IN ('admin','coordinador-flota')
    )
  );
