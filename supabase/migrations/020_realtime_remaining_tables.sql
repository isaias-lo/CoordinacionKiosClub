-- Enable Realtime on tables that write data but weren't yet subscribed.
-- Each block is wrapped individually so a missing table doesn't abort the rest.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.recepcion;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.despacho_rm;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.despacho_regiones;
EXCEPTION WHEN others THEN NULL; END $$;
