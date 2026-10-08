-- Una impresión reintentada ya no cuenta como reimpresión.
--
-- picking_prints guarda UNA fila por encargado y día (state_key, date), y cada POST suma 1 a
-- print_count. Si el POST llegaba pero se perdía la respuesta, la pantalla lo encolaba y la cola lo
-- reenviaba: print_count subía dos veces y la tarjeta mostraba «Reimpreso ×2» sin que nadie hubiera
-- reimpreso. La cola ya mandaba `client_op_id`; faltaba que alguien lo mirara.
--
-- Se guarda el id de la última operación que tocó la fila. Si llega otra vez el MISMO id, es el
-- reintento de esa misma impresión: se actualizan los datos pero print_count no sube. Alcanza con el
-- último porque un reintento siempre repite la operación más reciente de esa fila.
--
-- Aditivo: una columna nullable y una versión nueva de la función (con un parámetro más). La de 7
-- parámetros queda igual, así que el código anterior sigue funcionando. Se puede correr más de una vez.
--
-- El código nuevo usa esta versión si existe y, si no, cae a la de siempre (sin deduplicar).

ALTER TABLE public.picking_prints ADD COLUMN IF NOT EXISTS last_client_op_id text;
COMMENT ON COLUMN public.picking_prints.last_client_op_id IS
  'client_op_id de la última impresión registrada. Un reenvío con el mismo id no suma a print_count.';

CREATE OR REPLACE FUNCTION public.fn_record_picking_print(
  p_state_key text, p_date text, p_picker_label text, p_pallets integer, p_tipo text,
  p_printed_by_name text, p_batch text, p_client_op_id text
)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.picking_prints
    (state_key, date, picker_label, pallets, tipo, printed_at, printed_by_name, batch, print_count, last_client_op_id)
  VALUES
    (p_state_key, p_date::date, p_picker_label, p_pallets, p_tipo, now(), p_printed_by_name, p_batch, 1, p_client_op_id)
  ON CONFLICT (state_key, date) DO UPDATE SET
    print_count = public.picking_prints.print_count
      + CASE WHEN excluded.last_client_op_id IS NOT NULL
              AND excluded.last_client_op_id = public.picking_prints.last_client_op_id
             THEN 0 ELSE 1 END,
    printed_at        = CASE WHEN excluded.last_client_op_id IS NOT NULL
                              AND excluded.last_client_op_id = public.picking_prints.last_client_op_id
                             THEN public.picking_prints.printed_at ELSE now() END,
    picker_label      = excluded.picker_label,
    pallets           = excluded.pallets,
    tipo              = excluded.tipo,
    printed_by_name   = excluded.printed_by_name,
    batch             = excluded.batch,
    last_client_op_id = excluded.last_client_op_id;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_record_picking_print(text, text, text, integer, text, text, text, text)
  TO authenticated, service_role;
