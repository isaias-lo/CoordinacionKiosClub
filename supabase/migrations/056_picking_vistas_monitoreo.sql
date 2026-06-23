-- ============================================================
-- 056 — Vistas de monitoreo preventivo de Picking (solo lectura)
-- ============================================================
-- Detectan los problemas de los Casos 1 y 2 ANTES de que una tienda se llene de
-- pallets fantasma. Solo SELECT sobre tablas existentes; no modifican datos.
-- (Probadas en la investigación: la #1 detectó 08RNC×3 y 23PEÑ×78.)

-- 1) Creaciones SIN atribución (Caso 2): el creador quedó NULL (firma de la cola
--    offline / inserts sin usuario). Señal más fiable de pallets fantasma.
CREATE OR REPLACE VIEW public.v_picking_sin_atribucion AS
SELECT date, store_cod, state_key, picker_label,
       count(*)        AS pallets_sin_atrib,
       min(created_at) AS primera,
       max(created_at) AS ultima
FROM public.picking_eventos
WHERE event_type = 'crear' AND (actor_name IS NULL OR btrim(actor_name) = '')
GROUP BY date, store_cod, state_key, picker_label;

-- 2) Código (canonical_id) DUPLICADO entre pallets activos: dos pallets vivos con el
--    mismo código = duplicación real (sin falsos positivos por refs compartidos).
CREATE OR REPLACE VIEW public.v_picking_canonical_duplicado AS
SELECT date, store_cod, canonical_id,
       count(*)            AS n,
       array_agg(id ORDER BY id) AS ids
FROM public.picking_pallets
WHERE canonical_id IS NOT NULL AND is_active = true
GROUP BY date, store_cod, canonical_id
HAVING count(*) > 1;

-- 3) IMPRESO sin slot vivo con código (Caso 1): hay print pero no hay pallet activo
--    canonicalizado para ese grupo+fecha → no entra a bodega / Monitoreo en 0.
--    store_cod se deriva del state_key (picking_prints no tiene esa columna).
--    (Para la UI: filtrar date = hoy; en días pasados hay ruido legítimo por pallets
--     re-datados al ingresarlos en bodega vía claim-bodega.)
CREATE OR REPLACE VIEW public.v_picking_impreso_sin_slot AS
SELECT split_part(p.state_key, '__', 1) AS store_cod,
       p.date, p.state_key, p.picker_label, p.printed_by_name, p.batch, p.printed_at
FROM public.picking_prints p
WHERE NOT EXISTS (
  SELECT 1 FROM public.picking_pallets pp
  WHERE pp.state_key = p.state_key AND pp.date = p.date
    AND pp.is_active = true AND pp.canonical_id IS NOT NULL
);

-- 4) Conteo de pallets activos por tienda/día/tipo: para cuadrar rápido contra el muelle.
CREATE OR REPLACE VIEW public.v_picking_conteo_activos AS
SELECT date, store_cod, tipo, count(*) AS activos
FROM public.picking_pallets
WHERE is_active = true
GROUP BY date, store_cod, tipo;
