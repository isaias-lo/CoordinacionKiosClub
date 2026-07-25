-- Migración: acuse de recibo + fotos de recepción (tabla `recepcion`)
-- Correr en Supabase → SQL Editor → Run. Idempotente (IF NOT EXISTS).
--
--   recibi_conforme  : true = "Recibí conforme", false = "Recibí con observaciones", null = legado.
--   firma_metodo     : 'dibujo' (firmó) | 'acuse' (solo marcó el acuse) | '' (legado).
--   acuse_recibo     : etiqueta legible del acuse (para Sheet / reportes).
--   recepcion_fotos  : URLs públicas de las fotos subidas al bucket `recepcion-fotos`.

ALTER TABLE recepcion
  ADD COLUMN IF NOT EXISTS recibi_conforme boolean,
  ADD COLUMN IF NOT EXISTS firma_metodo    text   DEFAULT '',
  ADD COLUMN IF NOT EXISTS acuse_recibo    text   DEFAULT '',
  ADD COLUMN IF NOT EXISTS recepcion_fotos text[] DEFAULT '{}';
