-- ============================================================
-- 052 — BATCH (Transferir Agrupación) + conteo de (re)impresiones
-- ============================================================
-- picking_prints hace upsert por (state_key, date), así que reimprimir SOBREESCRIBE
-- la fila y nunca se supo cuántas veces se (re)imprimió. Agregamos:
--   - `batch`       : la "Transferir Agrupación" de Odoo (stock.picking.batch_id, ej. BATCH/39934)
--   - `print_count` : veces impreso (1 la primera vez, +1 por cada reimpresión)
-- y una función atómica que inserta o incrementa en conflicto (supabase.upsert no puede
-- hacer `col = col + 1` on-conflict).

ALTER TABLE public.picking_prints ADD COLUMN IF NOT EXISTS batch       text;
ALTER TABLE public.picking_prints ADD COLUMN IF NOT EXISTS print_count int NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.fn_record_picking_print(
  p_state_key       text,
  p_date            text,
  p_picker_label    text,
  p_pallets         int,
  p_tipo            text,
  p_printed_by_name text,
  p_batch           text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.picking_prints
    (state_key, date, picker_label, pallets, tipo, printed_at, printed_by_name, batch, print_count)
  VALUES
    (p_state_key, p_date::date, p_picker_label, p_pallets, p_tipo, now(), p_printed_by_name, p_batch, 1)
  ON CONFLICT (state_key, date) DO UPDATE SET
    print_count     = public.picking_prints.print_count + 1,
    printed_at      = now(),
    picker_label    = excluded.picker_label,
    pallets         = excluded.pallets,
    tipo            = excluded.tipo,
    printed_by_name = excluded.printed_by_name,
    batch           = excluded.batch;
$$;

GRANT EXECUTE ON FUNCTION public.fn_record_picking_print(text, text, text, int, text, text, text) TO authenticated;
