-- ============================================================
-- 050 — Auditoría de creación/eliminación de pallets en Picking
-- ============================================================
-- El monitoreo solo registraba impresiones y cambios de nombre. Las altas y
-- bajas de pallets/bultos/contenedores no dejaban rastro, así que no se podía
-- ver quién hizo clic en "+" (creó) y luego en "−" (eliminó), ni detectar
-- reincidencia (errores repetidos de un mismo supervisor).
--
-- Mismo patrón RLS que el resto: acceso completo para `authenticated`.

CREATE TABLE IF NOT EXISTS public.picking_eventos (
  id           bigserial PRIMARY KEY,
  date         date        NOT NULL DEFAULT CURRENT_DATE,
  event_type   text        NOT NULL CHECK (event_type IN ('crear', 'eliminar')),
  pallet_id    bigint,
  state_key    text,
  store_cod    text,
  tipo         text,
  picker_label text,
  actor_name   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Lectura del feed del día por fecha
CREATE INDEX IF NOT EXISTS idx_picking_eventos_date
  ON public.picking_eventos (date, created_at);

ALTER TABLE public.picking_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "picking_eventos_auth_all" ON public.picking_eventos;
CREATE POLICY "picking_eventos_auth_all" ON public.picking_eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
