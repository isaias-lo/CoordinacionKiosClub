-- ============================================================
-- 057 — Flota: separar "en servicio" de "existe en la flota"
-- ============================================================
-- Antes, el toggle "en servicio" (on) de la UI se mapeaba a la columna `activo`,
-- que en realidad significa "el vehículo existe en la flota" (DELETE = activo=false,
-- GET filtra activo=true). Además el toggle de la UI no se persistía, así que al
-- entrar al Enrutador SIEMPRE aparecían todos en servicio.
--
-- Nueva columna `en_servicio`: memoria PERMANENTE de qué vehículos están en
-- servicio para el ruteo. `activo` queda solo para "existe/borrado en la flota".
-- Default true → comportamiento sin cambios hasta que el usuario desmarque alguno.

ALTER TABLE public.flota_vehiculos
  ADD COLUMN IF NOT EXISTS en_servicio boolean NOT NULL DEFAULT true;
