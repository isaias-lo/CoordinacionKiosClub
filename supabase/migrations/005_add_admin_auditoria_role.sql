-- ============================================================
-- Phase 5: Add admin-auditoria role to profiles check constraint
-- ============================================================

-- Drop the old constraint and replace it with the updated one
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('auditor', 'admin-auditoria', 'despachador', 'admin'));
