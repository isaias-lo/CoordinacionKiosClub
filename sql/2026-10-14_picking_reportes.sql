-- Reportes de Picking: «Reportar un problema» y «Empezar de cero» (Ayuda › ¿Algo se trabó?).
--
-- El 14/10/2026 un bug llegó como «atrapada en egn» y hubo que reconstruir qué veía la persona.
-- Cada fila guarda la foto del estado de la pantalla (pestaña, tiendas elegidas, sección, versión).
-- «Empezar de cero» también deja su fila, sin texto: saber QUÉ estado hubo que borrar es el dato.
--
-- Solo se inserta desde el navegador; se lee con SQL. No hay política de lectura a propósito: un
-- usuario no necesita ver los reportes de otros. Aditivo, se puede correr más de una vez.

CREATE TABLE IF NOT EXISTS public.picking_reportes (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id    uuid DEFAULT auth.uid(),
  nombre     text,
  motivo     text NOT NULL CHECK (motivo IN ('reporte', 'empezar-de-cero')),
  texto      text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 1000),
  estado     jsonb NOT NULL,
  version    text
);

COMMENT ON TABLE public.picking_reportes IS
  'Reportes desde Picking › Ayuda: texto de la persona + foto del estado de la pantalla.';

ALTER TABLE public.picking_reportes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS picking_reportes_insert ON public.picking_reportes;
CREATE POLICY picking_reportes_insert ON public.picking_reportes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS picking_reportes_created ON public.picking_reportes (created_at DESC);
