-- Drop unused composite index on picking_pallets (Supabase Advisor: never used in queries).
-- The active queries use picking_pallets_active_store (date, store_cod, is_active) instead.
DROP INDEX IF EXISTS public.picking_pallets_state_date;

-- Drop duplicate index on control_cruce_skus (identical to idx_skus_picking_det).
-- Keeping idx_skus_picking_det (the canonical name from migration 039).
DROP INDEX IF EXISTS public.idx_skus_pick_det;
