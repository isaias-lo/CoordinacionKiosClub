-- ============================================================
-- Phase 6: Picker configuration table
-- Stores picker name mappings (Pickers 1..18 → real name)
-- ============================================================

create table if not exists public.picker_config (
  id          integer primary key default 1,
  nombres     jsonb   not null default '{}'::jsonb,
  updated_at  timestamptz default now(),
  constraint  picker_config_single_row check (id = 1)
);

alter table public.picker_config enable row level security;

-- All authenticated users can read (auditors need the names)
create policy "picker_config_read" on public.picker_config
  for select to authenticated using (true);

-- Authenticated users can upsert (UI restricts to admin-auditoria role)
create policy "picker_config_write" on public.picker_config
  for all to authenticated using (true) with check (true);

-- Insert default empty row
insert into public.picker_config (id, nombres)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
