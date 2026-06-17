-- ============================================================
-- 051 — Guías de despacho subidas en bodega (antes del manifiesto)
-- ============================================================
-- Las guías DTE (con timbres) se suben normalmente en las bodegas de Santiago y
-- Regiones DURANTE el armado, es decir ANTES de que el Enrutador genere el
-- manifiesto/QR. Antes solo se vinculaban si la ruta ya existía (vía ruta_guias),
-- por eso no aparecían para el fiscalizador.
--
-- Esta tabla persiste cada subida por tienda + fecha + URL pública del PDF para
-- que, al crearse el manifiesto (POST /api/rutas-despacho), éste "jale" las guías
-- ya subidas. El código de tienda se guarda normalizado (norm()).

CREATE TABLE IF NOT EXISTS public.guias_subidas (
  id         bigserial PRIMARY KEY,
  store_cod  text        NOT NULL,
  folios     text[]      NOT NULL DEFAULT '{}',
  drive_url  text,
  fecha      date        NOT NULL DEFAULT CURRENT_DATE,  -- día de subida (Chile)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Búsqueda por tienda dentro de una ventana de fechas, más reciente primero
CREATE INDEX IF NOT EXISTS idx_guias_subidas_store_fecha
  ON public.guias_subidas (store_cod, fecha DESC, created_at DESC);

ALTER TABLE public.guias_subidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "guias_subidas_auth_all" ON public.guias_subidas;
CREATE POLICY "guias_subidas_auth_all" ON public.guias_subidas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
