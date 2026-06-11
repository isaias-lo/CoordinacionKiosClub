-- 039: Tabla control_cruce_skus para múltiples SKU por picking + detalle
-- La columna 'sku' de control_cruce_manual ya no se usa (quedará vacía o se puede eliminar manualmente)

CREATE TABLE IF NOT EXISTS control_cruce_skus (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  picking_name text NOT NULL,
  detalle      text NOT NULL DEFAULT '',
  sku          text NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- Índice compuesto: buscar SKUs de un picking + detalle específico
CREATE INDEX IF NOT EXISTS idx_skus_pick_det ON control_cruce_skus(picking_name, detalle);

-- RLS: permitir todo a usuarios autenticados (mismo patrón que control_cruce_manual)
ALTER TABLE control_cruce_skus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated CRUD" ON control_cruce_skus
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
