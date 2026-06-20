-- ============================================================
-- 053 — Tiendas de adelanto / extra por fecha
-- Permite que Coordinación agregue una tienda al flujo operativo de un día
-- (Picking + Bodegas Santiago/Regiones + Enrutador) SIN tocar el calendario
-- central (calendario_central). Cada fila = una tienda extra para una fecha.
--   zona: 'rm' | 'costa' | 'fal'  (mismos buckets del calendario)
--   tipo: 'adelanto' (extensible a otros motivos a futuro)
--   fecha: día en que la tienda entra al flujo (se prepara/aparece)
--   fecha_despacho: cuándo se despacharía (se muestra en la etiqueta)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tiendas_adelanto (
  id              bigserial    PRIMARY KEY,
  fecha           date         NOT NULL,
  store_cod       text         NOT NULL,
  zona            text         NOT NULL CHECK (zona IN ('rm', 'costa', 'fal')),
  tipo            text         NOT NULL DEFAULT 'adelanto',
  fecha_despacho  date,
  creado_por      text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (fecha, store_cod)
);

CREATE INDEX IF NOT EXISTS idx_tiendas_adelanto_fecha ON public.tiendas_adelanto (fecha);

ALTER TABLE public.tiendas_adelanto ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (lo consumen Picking y Bodegas)
DROP POLICY IF EXISTS "Lectura autenticada tiendas_adelanto" ON public.tiendas_adelanto;
CREATE POLICY "Lectura autenticada tiendas_adelanto"
  ON public.tiendas_adelanto FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserción / borrado: vía service role (API routes) — no necesita policy.

-- Realtime: que la lista de adelantos se propague cross-device al instante.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tiendas_adelanto;
EXCEPTION WHEN others THEN NULL; END $$;
