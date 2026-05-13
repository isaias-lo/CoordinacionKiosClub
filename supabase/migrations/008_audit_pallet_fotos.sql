-- ============================================================
-- Phase 8: Per-pallet photos on audit_entries
-- Stores array of { subTipo, url } objects per audit entry
-- ============================================================

alter table public.audit_entries
  add column if not exists pallet_fotos jsonb not null default '[]'::jsonb;
