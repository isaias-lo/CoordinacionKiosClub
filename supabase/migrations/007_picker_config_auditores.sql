-- ============================================================
-- Phase 7: Add auditores list to picker_config
-- Stores auditor name list managed by admin-auditoria
-- ============================================================

alter table public.picker_config
  add column if not exists auditores jsonb not null default '[]'::jsonb;
