-- ============================================================
-- Phase 3: audit_entries + dispatch_history tables
-- ============================================================

-- Audit entries (replaces auditHistory in localStorage)
create table if not exists public.audit_entries (
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
  tipos_error       text[]  not null default '{}',
  correccion        text,
  resultado         text,
  observaciones     text not null default '',
  reauditoria_de_id text,
  operaciones       jsonb not null default '[]',
  productos         jsonb not null default '[]'
);

alter table public.audit_entries enable row level security;

create policy "audit_entries_select" on public.audit_entries
  for select using (auth.role() = 'authenticated');

create policy "audit_entries_insert" on public.audit_entries
  for insert with check (auth.uid() = user_id);

create index if not exists audit_entries_created_at_idx on public.audit_entries (created_at desc);
create index if not exists audit_entries_picker_idx     on public.audit_entries (picker);
create index if not exists audit_entries_resultado_idx  on public.audit_entries (resultado);

-- Dispatch history (replaces dispatchHistory in localStorage)
-- Note: rows (Excel data) are NOT stored — too large. Re-export uses localStorage.
create table if not exists public.dispatch_history (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  user_id       uuid references auth.users(id) on delete set null,
  date          text not null,
  total_pallets int  not null default 0,
  total_bultos  int  not null default 0,
  tiendas       jsonb not null default '[]'
);

alter table public.dispatch_history enable row level security;

create policy "dispatch_history_select" on public.dispatch_history
  for select using (auth.role() = 'authenticated');

create policy "dispatch_history_insert" on public.dispatch_history
  for insert with check (auth.uid() = user_id);

create index if not exists dispatch_history_created_at_idx on public.dispatch_history (created_at desc);
