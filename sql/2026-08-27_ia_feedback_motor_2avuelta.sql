-- Migración: cerrar el lazo de feedback del motor de asignación (tabla `ia_asignacion_feedback`)
-- Correr en Supabase → SQL Editor → Run ANTES de mergear/desplegar la PR. Idempotente.
--
--   motor          : 'v2' | 'ia' — qué motor PRODUJO `propuesta_ia`. `elegida` dice qué se ELIGIÓ,
--                    no qué se PROPUSO. Antes la propuesta solo se guardaba si venía del LLM ('ia'),
--                    y como el LLM casi nunca corre quedaba null: por eso las filas viejas no tienen
--                    con qué comparar. Ahora se guarda SIEMPRE la propuesta que se mostró y `motor`
--                    distingue de dónde vino (el optimizador geográfico v2 o el asistente IA).
--   segunda_vuelta : cods que el motor mandó CORRECTAMENTE a 2ª vuelta (no caben hoy en la flota).
--                    Se EXCLUYEN del cálculo de coincidencia: una tienda bien mandada a 2ª vuelta no
--                    debe contar como desacuerdo, o la métrica miente.
--   sin_flota      : cods sin ningún vehículo activo que los lleve. Misma exclusión que segunda_vuelta.

ALTER TABLE ia_asignacion_feedback
  ADD COLUMN IF NOT EXISTS motor          text,
  ADD COLUMN IF NOT EXISTS segunda_vuelta jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sin_flota      jsonb DEFAULT '[]'::jsonb;
