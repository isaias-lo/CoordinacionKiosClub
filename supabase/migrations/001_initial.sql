-- ============================================================
-- Phase 1: initial schema + storage buckets
-- ============================================================

-- Stores catalogue (optional lookup)
create table if not exists public.stores (
  id   serial primary key,
  cod  text unique not null,
  name text not null,
  address text
);

-- Reception records
create table if not exists public.recepcion (
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
  firma_url          text
);

-- Guides / PDFs
create table if not exists public.guides (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  filename   text not null,
  url        text not null
);

-- ──────────────────────────────
-- RLS: Phase 1 = public access
-- ──────────────────────────────
alter table public.stores    enable row level security;
alter table public.recepcion enable row level security;
alter table public.guides    enable row level security;

create policy "public_all_stores"    on public.stores    for all using (true) with check (true);
create policy "public_all_recepcion" on public.recepcion for all using (true) with check (true);
create policy "public_all_guides"    on public.guides    for all using (true) with check (true);

-- ──────────────────────────────
-- Storage buckets
-- ──────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('signatures', 'signatures', true),
  ('guides',     'guides',     true)
on conflict (id) do nothing;

create policy "public_signatures_select" on storage.objects for select using (bucket_id = 'signatures');
create policy "public_signatures_insert" on storage.objects for insert with check (bucket_id = 'signatures');
create policy "public_guides_select"     on storage.objects for select using (bucket_id = 'guides');
create policy "public_guides_insert"     on storage.objects for insert with check (bucket_id = 'guides');
