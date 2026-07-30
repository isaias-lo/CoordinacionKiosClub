-- Migración: idempotencia + edición con auditoría (tabla `recepcion`)
-- Correr en Supabase → SQL Editor → Run ANTES de mergear/desplegar la PR. Idempotente.
--
--   client_op_id        : id único generado por el cliente por cada envío. Permite que un
--                         reintento (doble tap / reenvío manual sin señal) NO cree un duplicado.
--                         El índice único parcial de abajo hace que la garantía la dé la BD.
--   editado_en          : timestamp de la última edición de la recepción.
--   ediciones           : contador de ediciones (0 = nunca editada).
--   historial_ediciones : bitácora jsonb; cada edición agrega
--                         { ts, receptor, rut, cambios: [{campo, de, a}] }.
--                         Cada edición registra SU PROPIO receptor+rut (accountability):
--                         al editar, la persona se re-identifica; no se ve/edita la anterior.

ALTER TABLE recepcion
  ADD COLUMN IF NOT EXISTS client_op_id        text,
  ADD COLUMN IF NOT EXISTS editado_en          timestamptz,
  ADD COLUMN IF NOT EXISTS ediciones           int   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS historial_ediciones jsonb DEFAULT '[]'::jsonb;

-- Idempotencia: dos envíos con el mismo client_op_id no pueden coexistir.
CREATE UNIQUE INDEX IF NOT EXISTS recepcion_client_op_id_key
  ON recepcion (client_op_id)
  WHERE client_op_id IS NOT NULL;
