CREATE TABLE IF NOT EXISTS public.despacho_sesion (
  fecha      date    NOT NULL DEFAULT CURRENT_DATE,
  fuente     text    NOT NULL CHECK (fuente IN ('regiones', 'santiago')),
  tienda_cod text    NOT NULL,
  pallets    integer NOT NULL DEFAULT 0,
  bultos     integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, fuente, tienda_cod)
);

ALTER TABLE public.despacho_sesion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sesion_all_authenticated" ON public.despacho_sesion
  FOR ALL USING (auth.role() = 'authenticated');

ALTER PUBLICATION supabase_realtime ADD TABLE public.despacho_sesion;
