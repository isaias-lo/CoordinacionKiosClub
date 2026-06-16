-- 048 — despacho_regiones carecía de picking_slot_id (despacho_rm sí lo tiene).
-- Es donde se guarda el #488 (id del pallet = código de la etiqueta), que ahora
-- va en la columna AD ("CÓDIGO") del Sheet en vez del canonical (que queda en col A / id).
-- Aplicado a producción (aiclobncdhxjxdlvkezk) vía MCP el 2026-06-16.

alter table public.despacho_regiones
  add column if not exists picking_slot_id integer;
