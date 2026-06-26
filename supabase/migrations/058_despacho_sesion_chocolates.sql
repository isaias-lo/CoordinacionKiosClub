-- ============================================================
-- 058 — despacho_sesion: agregar chocolates (CH)
-- ============================================================
-- despacho_sesion (counts cross-device por fecha/fuente/tienda) guardaba solo
-- pallets/bultos/contenedores. Los chocolates (CH) se descartaban en pushCounts,
-- así que la vista global (Enrutador y el Manual global de las bodegas) no tenía CH.
-- Esta columna permite propagar el CH a la fuente global. Default 0 → sin cambios
-- para filas existentes.

ALTER TABLE public.despacho_sesion
  ADD COLUMN IF NOT EXISTS chocolates integer NOT NULL DEFAULT 0;
