-- [Fase 5] Bitácora de cambios del catálogo compartido.
--
-- El calendario, la flota, los roles y las tiendas son mutables y compartidos, y no queda rastro
-- de quién cambió qué. Cuando desapareció 40LIL, o cuando un camión "se guardaba y desaparecía",
-- hubo que hacer forense sobre la base: cruzar `shared_session_state` con `rutas_despacho` y con
-- el feedback del motor para reconstruir un día.
--
-- Es append-only a propósito: un registro que se puede editar no sirve para responder qué pasó.
--
-- Aditivo: no toca ninguna tabla existente. Se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.bitacora_cambios (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- El actor sale del TOKEN verificado en la ruta, nunca del cliente: no se puede falsear.
  actor_id    text,
  actor_name  text,
  entidad     text NOT NULL,          -- 'tienda' | 'flota'
  entidad_id  text,                   -- código de tienda, patente
  accion      text NOT NULL,          -- 'crear' | 'editar' | 'eliminar'
  -- La línea legible: "sector: ∅ → Corredor Oriente · región: Araucanía  → Araucanía".
  resumen     text,
  -- El detalle completo, para reconstruir. `antes` es null al crear.
  antes       jsonb,
  despues     jsonb
);

COMMENT ON TABLE  public.bitacora_cambios IS 'Append-only: quién cambió qué en el catálogo compartido, y de qué a qué.';
COMMENT ON COLUMN public.bitacora_cambios.resumen IS 'Los campos que cambiaron, en una línea legible. El detalle está en antes/despues.';

-- El uso real es "los últimos cambios" y "el historial de esta tienda/camión".
CREATE INDEX IF NOT EXISTS bitacora_cambios_created_idx  ON public.bitacora_cambios (created_at DESC);
CREATE INDEX IF NOT EXISTS bitacora_cambios_entidad_idx  ON public.bitacora_cambios (entidad, entidad_id, created_at DESC);

ALTER TABLE public.bitacora_cambios ENABLE ROW LEVEL SECURITY;

-- Solo el service role (las rutas del servidor) escribe y lee. El cliente nunca toca esta tabla
-- directamente: si pudiera escribirla, el registro dejaría de ser confiable.
DROP POLICY IF EXISTS bitacora_service_all ON public.bitacora_cambios;
CREATE POLICY bitacora_service_all ON public.bitacora_cambios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Comprobación
select count(*) as filas from public.bitacora_cambios;
