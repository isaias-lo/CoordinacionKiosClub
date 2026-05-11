-- ============================================================
-- Phase 2: Auth profiles + role-based RLS
-- ============================================================

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id        uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  role      text not null
              check (role in ('auditor', 'despachador', 'admin'))
              default 'auditor',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- Admins can read all profiles
create policy "profiles_select_admin" on public.profiles
  for select using (
    exists (
      select 1 from public.profiles p2
      where p2.id = auth.uid() and p2.role = 'admin'
    )
  );

-- Only service role can insert / update profiles
create policy "profiles_service_role_all" on public.profiles
  for all using (auth.role() = 'service_role');

-- ──────────────────────────────────────────────
-- Trigger: auto-create profile on user sign-up
-- Also syncs role into JWT user_metadata so middleware
-- can read it without a DB call.
-- ──────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role', 'auditor');

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role
  )
  on conflict (id) do nothing;

  -- Keep role in JWT metadata so middleware reads it without a DB query
  update auth.users
  set raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', v_role)
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────
-- Update recepcion / guides RLS to require auth
-- (keep public insert via service role for API routes)
-- ──────────────────────────────────────────────
-- No changes needed for Phase 2 — API routes use service_role key
-- which bypasses RLS entirely. Phase 3 will add per-user policies.

-- ──────────────────────────────────────────────
-- HOW TO ASSIGN / CHANGE A USER'S ROLE
-- (always update BOTH tables so JWT stays in sync)
--
--   UPDATE auth.users
--   SET raw_user_meta_data = raw_user_meta_data || '{"role":"despachador"}'::jsonb
--   WHERE email = 'usuario@empresa.cl';
--
--   UPDATE public.profiles
--   SET role = 'despachador'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'usuario@empresa.cl');
--
-- Or pass metadata during invite/creation:
--   { "role": "despachador", "full_name": "Juan Pérez" }
-- ──────────────────────────────────────────────
