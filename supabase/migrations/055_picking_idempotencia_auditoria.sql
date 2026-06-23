-- ============================================================
-- 055 — Picking: idempotencia anti-duplicados + auditoría de TODO borrado
-- ============================================================
-- Contexto (bugs reales investigados):
--  · Caso 2 (08RNC): la cola offline re-insertaba 'add' sin clave → 3 pallets
--    duplicados (sin UNIQUE no había forma de evitarlo).
--  · Casos 1 y 2: pallets (1993, 1990-1992) desaparecieron de picking_pallets
--    SIN evento 'eliminar' → borrados manuales/externos quedaban sin rastro.
--
-- Esta migración:
--  1. client_op_id (uuid) + índice UNIQUE parcial → idempotencia de creación.
--  2. Trigger AFTER DELETE → registra SIEMPRE un evento 'eliminar' en
--     picking_eventos (app, dashboard o SQL manual). El actor se pasa por el
--     GUC de sesión 'app.actor' (lo setea la RPC fn_delete_picking_pallet); si
--     no está, queda NULL (borrado directo no atribuible).
--  3. fn_delete_picking_pallet(id, actor): borra el pallet seteando el actor en
--     la MISMA transacción para que el trigger lo capture (evita doble evento:
--     el endpoint deja de loguear 'eliminar' por su cuenta y usa esta RPC).

-- ── 1. Idempotencia ───────────────────────────────────────────
ALTER TABLE public.picking_pallets
  ADD COLUMN IF NOT EXISTS client_op_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS picking_pallets_client_op_id_uidx
  ON public.picking_pallets (client_op_id)
  WHERE client_op_id IS NOT NULL;

-- ── 2. Auditoría de borrados (trigger) ────────────────────────
CREATE OR REPLACE FUNCTION public.fn_audit_picking_pallet_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.picking_eventos
    (date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name)
  VALUES
    (OLD.date, 'eliminar', OLD.id, OLD.state_key, OLD.store_cod, OLD.tipo, OLD.picker_label,
     NULLIF(current_setting('app.actor', true), ''));
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_picking_pallet_delete ON public.picking_pallets;
CREATE TRIGGER trg_audit_picking_pallet_delete
  AFTER DELETE ON public.picking_pallets
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_picking_pallet_delete();

-- ── 3. RPC de borrado con actor (única transacción) ───────────
CREATE OR REPLACE FUNCTION public.fn_delete_picking_pallet(p_id bigint, p_actor text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.actor', COALESCE(p_actor, ''), true); -- true = local a la transacción
  DELETE FROM public.picking_pallets WHERE id = p_id;            -- dispara el trigger de auditoría
END;
$$;
