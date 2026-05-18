-- ════════════════════════════════════════════════════════════
-- Catch-up: create all missing tables + enable Realtime
-- Safe to re-run (IF NOT EXISTS everywhere)
-- ════════════════════════════════════════════════════════════

-- ── stores (001) ──
CREATE TABLE IF NOT EXISTS public.stores (
  id      serial primary key,
  cod     text unique not null,
  name    text not null,
  address text
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stores' AND policyname='public_all_stores') THEN
    CREATE POLICY "public_all_stores" ON public.stores FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── recepcion (001 + 011) ──
CREATE TABLE IF NOT EXISTS public.recepcion (
  id                 bigserial primary key,
  created_at         timestamptz not null default now(),
  cod                text not null,
  tienda             text not null,
  direccion          text,
  pallets_sent       int,
  bultos_sent        int,
  pallets_recibidos  int,
  bultos_recibidos   int,
  receptor           text,
  rut                text,
  firma_url          text,
  observaciones      text    default '',
  sello_estado       text    default '',
  sello_foto_url     text    default '',
  estado_fotos       jsonb   default '[]'
);
ALTER TABLE public.recepcion ADD COLUMN IF NOT EXISTS observaciones  text  default '';
ALTER TABLE public.recepcion ADD COLUMN IF NOT EXISTS sello_estado   text  default '';
ALTER TABLE public.recepcion ADD COLUMN IF NOT EXISTS sello_foto_url text  default '';
ALTER TABLE public.recepcion ADD COLUMN IF NOT EXISTS estado_fotos   jsonb default '[]';
ALTER TABLE public.recepcion ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recepcion' AND policyname='public_all_recepcion') THEN
    CREATE POLICY "public_all_recepcion" ON public.recepcion FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── guides (001) ──
CREATE TABLE IF NOT EXISTS public.guides (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  filename   text not null,
  url        text not null
);
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='guides' AND policyname='public_all_guides') THEN
    CREATE POLICY "public_all_guides" ON public.guides FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── profiles constraint update (005) ──
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('auditor','admin-auditoria','despachador','admin','supervisor','picker','asistente-despacho','coordinador-flota'));

-- ── audit_entries (003 + 004 + 008 + 009 + 012) ──
CREATE TABLE IF NOT EXISTS public.audit_entries (
  id                text primary key,
  created_at        timestamptz not null default now(),
  user_id           uuid references auth.users(id) on delete set null,
  fecha             text not null,
  hora              text not null,
  auditor           text not null,
  picker            text,
  tienda_cod        text not null,
  tienda_nombre     text not null,
  tienda_area       text,
  tipo              text not null,
  pallets           int  not null default 0,
  tiene_errores     bool not null default false,
  tipos_error       text[] not null default '{}',
  correccion        text,
  resultado         text,
  observaciones     text not null default '',
  reauditoria_de_id text,
  operaciones       jsonb not null default '[]',
  productos         jsonb not null default '[]',
  foto_url          text,
  pallet_fotos      jsonb not null default '[]',
  picker_nombre     text  default '',
  foto_urls         jsonb default '[]',
  error_foto_urls   jsonb default '[]'
);
ALTER TABLE public.audit_entries ADD COLUMN IF NOT EXISTS foto_url        text;
ALTER TABLE public.audit_entries ADD COLUMN IF NOT EXISTS pallet_fotos    jsonb not null default '[]';
ALTER TABLE public.audit_entries ADD COLUMN IF NOT EXISTS picker_nombre   text  default '';
ALTER TABLE public.audit_entries ADD COLUMN IF NOT EXISTS foto_urls       jsonb default '[]';
ALTER TABLE public.audit_entries ADD COLUMN IF NOT EXISTS error_foto_urls jsonb default '[]';
ALTER TABLE public.audit_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_entries' AND policyname='audit_entries_select') THEN
    CREATE POLICY "audit_entries_select" ON public.audit_entries FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_entries' AND policyname='audit_entries_insert') THEN
    CREATE POLICY "audit_entries_insert" ON public.audit_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS audit_entries_created_at_idx ON public.audit_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_entries_picker_idx     ON public.audit_entries (picker);
CREATE INDEX IF NOT EXISTS audit_entries_resultado_idx  ON public.audit_entries (resultado);

-- ── dispatch_history (003) ──
CREATE TABLE IF NOT EXISTS public.dispatch_history (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  user_id       uuid references auth.users(id) on delete set null,
  date          text not null,
  total_pallets int  not null default 0,
  total_bultos  int  not null default 0,
  tiendas       jsonb not null default '[]'
);
ALTER TABLE public.dispatch_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_history' AND policyname='dispatch_history_select') THEN
    CREATE POLICY "dispatch_history_select" ON public.dispatch_history FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dispatch_history' AND policyname='dispatch_history_insert') THEN
    CREATE POLICY "dispatch_history_insert" ON public.dispatch_history FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS dispatch_history_created_at_idx ON public.dispatch_history (created_at DESC);

-- ── picker_config (006 + 007 + 010) ──
CREATE TABLE IF NOT EXISTS public.picker_config (
  id             integer primary key default 1,
  nombres        jsonb not null default '{}'::jsonb,
  auditores      jsonb not null default '[]'::jsonb,
  picker_nombres jsonb default '[]',
  updated_at     timestamptz default now(),
  CONSTRAINT picker_config_single_row CHECK (id = 1)
);
ALTER TABLE public.picker_config ADD COLUMN IF NOT EXISTS auditores      jsonb not null default '[]'::jsonb;
ALTER TABLE public.picker_config ADD COLUMN IF NOT EXISTS picker_nombres jsonb default '[]';
ALTER TABLE public.picker_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='picker_config' AND policyname='picker_config_read') THEN
    CREATE POLICY "picker_config_read" ON public.picker_config FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='picker_config' AND policyname='picker_config_write') THEN
    CREATE POLICY "picker_config_write" ON public.picker_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
INSERT INTO public.picker_config (id, nombres) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- ── tiendas (013) ──
CREATE TABLE IF NOT EXISTS public.tiendas (
  codigo          text        primary key,
  nombre          text        not null default '',
  direccion       text        not null default '',
  region          text        not null default '',
  sector_comuna   text        not null default '',
  corredor        text        not null default '',
  tipo            text        not null default '',
  ventana         text        not null default '',
  frecuencia      text        not null default '',
  prom_por_dia    text        not null default '',
  lat             float8,
  lon             float8,
  correos         text        not null default '',
  tel_encargado   text        not null default '',
  supervisor      text        not null default '',
  tel_supervisor  text        not null default '',
  transportista   text        not null default '',
  activo          boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
CREATE OR REPLACE FUNCTION update_tiendas_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN new.updated_at = now(); RETURN new; END;
$$;
DROP TRIGGER IF EXISTS tiendas_updated_at ON public.tiendas;
CREATE TRIGGER tiendas_updated_at
  BEFORE UPDATE ON public.tiendas
  FOR EACH ROW EXECUTE FUNCTION update_tiendas_updated_at();
ALTER TABLE public.tiendas ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tiendas' AND policyname='Authenticated users can read tiendas') THEN
    CREATE POLICY "Authenticated users can read tiendas" ON public.tiendas FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='tiendas' AND policyname='Service role can manage tiendas') THEN
    CREATE POLICY "Service role can manage tiendas" ON public.tiendas FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- ── produccion_diaria (new) ──
CREATE TABLE IF NOT EXISTS public.produccion_diaria (
  picker_nombre      text    not null,
  fecha              date    not null,
  pallets_producidos int     not null default 0,
  updated_at         timestamptz not null default now(),
  PRIMARY KEY (picker_nombre, fecha)
);
ALTER TABLE public.produccion_diaria ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produccion_diaria' AND policyname='produccion_diaria_all_authenticated') THEN
    CREATE POLICY "produccion_diaria_all_authenticated" ON public.produccion_diaria FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- Enable Supabase Realtime on key tables
-- ════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.produccion_diaria;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_history;
