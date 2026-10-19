-- Idempotencia de dos altas que hoy pueden contar doble.
--
-- 1) Crear una unidad desde Bodega (create-bodega). Con mal wifi, si el INSERT llega pero la
--    respuesta se pierde, la pantalla dice «sin conexión» y la persona vuelve a tocar: queda una
--    unidad de más con el número siguiente. picking_pallets YA tiene `client_op_id` con índice único
--    (picking_pallets_client_op_id_uidx, lo usa la cola de Picking); faltaba que Bodega lo mandara y
--    que la función lo respetara. Se agrega una versión de fn_create_bodega_slot con un parámetro
--    más. La de 4 parámetros queda igual, así que el código anterior sigue funcionando.
--    `client_op_id` es uuid en picking_pallets: el parámetro llega como texto (igual que desde
--    PostgREST) y se convierte adentro. Un id que no sea uuid hace fallar la llamada.
--    Sin DEFAULT en p_client_op_id a propósito: con default, una llamada de 4 argumentos sería
--    ambigua entre las dos versiones.
--
-- 2) Impresiones (picking_prints). sql/2026-10-08_picking_prints_idempotencia.sql recuerda solo
--    el ÚLTIMO client_op_id de la fila. Si el equipo A imprime, el equipo B imprime el mismo
--    encargado, y después llega el reintento de A, el id ya no es el último y A cuenta dos veces.
--    Ahora se recuerdan los últimos 20. Misma firma de 8 parámetros: no cambia el código.
--
-- Aditivo y se puede correr más de una vez.

create or replace function public.fn_create_bodega_slot(
  p_date         text,
  p_store_cod    text,
  p_tipo         text,
  p_contenido    text,
  p_client_op_id text
)
returns setof public.picking_pallets
language plpgsql
set search_path to 'public'
as $$
declare
  v_seq       int;
  v_stamp     text;
  v_canonical text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_date || '|' || p_store_cod || '|' || p_tipo, 0));

  -- Reintento de la misma alta: devolver la que ya existe. Dentro del candado, así que dos
  -- reintentos simultáneos con el mismo id no pasan los dos por acá.
  if p_client_op_id is not null then
    return query select * from picking_pallets where client_op_id = p_client_op_id::uuid;
    if found then return; end if;
  end if;

  select coalesce(max(seq), 0) + 1
    into v_seq
    from picking_pallets
   where date::text = p_date
     and store_cod  = p_store_cod
     and tipo       = p_tipo
     and is_active  = true;

  v_stamp := substr(p_date, 9, 2) || substr(p_date, 6, 2) || substr(p_date, 1, 4);

  -- Igual que fn_create_bodega_slot de 4 parámetros y que src/lib/canonicalSlot.ts.
  v_canonical := case p_tipo
    when 'P'  then 'P'  || v_seq || p_store_cod || v_stamp || 'P'
    when 'B'  then          v_seq || 'B' || p_store_cod || v_stamp || 'B'
    when 'CH' then 'CH' || v_seq || p_store_cod || v_stamp || 'CH'
    when 'C'  then 'C'  || v_seq || p_store_cod || v_stamp || 'C'
    when 'CC' then 'CC' || v_seq || p_store_cod || v_stamp || 'CC'
    when 'CN' then 'CN' || v_seq || p_store_cod || v_stamp || 'CN'
    when 'A'  then 'A'  || v_seq || p_store_cod || v_stamp || 'A'
    when 'W'  then 'W'  || v_seq || p_store_cod || v_stamp || 'W'
    else               v_seq || p_store_cod || v_stamp
  end;

  return query
  insert into picking_pallets
    (date, store_cod, state_key, picker_label, tipo, contenido, refs, seq, canonical_id, is_active, client_op_id)
  values
    (p_date::date, p_store_cod, p_store_cod || '__bodega', 'Bodega', p_tipo,
     coalesce(p_contenido, 'hogar'), '', v_seq, v_canonical, true, p_client_op_id::uuid)
  returning *;
end;
$$;

alter table public.picking_prints add column if not exists last_client_op_id text;
alter table public.picking_prints add column if not exists client_op_ids text[] not null default '{}';
comment on column public.picking_prints.client_op_ids is
  'Últimos 20 client_op_id registrados. Un reenvío con un id de esta lista no suma a print_count.';

create or replace function public.fn_record_picking_print(
  p_state_key text, p_date text, p_picker_label text, p_pallets integer, p_tipo text,
  p_printed_by_name text, p_batch text, p_client_op_id text
)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into public.picking_prints
    (state_key, date, picker_label, pallets, tipo, printed_at, printed_by_name, batch, print_count,
     last_client_op_id, client_op_ids)
  values
    (p_state_key, p_date::date, p_picker_label, p_pallets, p_tipo, now(), p_printed_by_name, p_batch, 1,
     p_client_op_id, case when p_client_op_id is null then '{}'::text[] else array[p_client_op_id] end)
  on conflict (state_key, date) do update set
    print_count = public.picking_prints.print_count
      + case when excluded.last_client_op_id is not null
              and (excluded.last_client_op_id = any(public.picking_prints.client_op_ids)
                   or excluded.last_client_op_id = public.picking_prints.last_client_op_id)
             then 0 else 1 end,
    printed_at = case when excluded.last_client_op_id is not null
                       and (excluded.last_client_op_id = any(public.picking_prints.client_op_ids)
                            or excluded.last_client_op_id = public.picking_prints.last_client_op_id)
                      then public.picking_prints.printed_at else now() end,
    picker_label      = excluded.picker_label,
    pallets           = excluded.pallets,
    tipo              = excluded.tipo,
    printed_by_name   = excluded.printed_by_name,
    batch             = excluded.batch,
    last_client_op_id = excluded.last_client_op_id,
    client_op_ids = case
      when excluded.last_client_op_id is null
        or excluded.last_client_op_id = any(public.picking_prints.client_op_ids)
        then public.picking_prints.client_op_ids
      else (array_append(public.picking_prints.client_op_ids, excluded.last_client_op_id))
           [greatest(1, cardinality(public.picking_prints.client_op_ids) - 18):]
    end;
$function$;

revoke execute on function public.fn_create_bodega_slot(text, text, text, text, text) from public, anon;
grant execute on function public.fn_create_bodega_slot(text, text, text, text, text) to service_role;
revoke execute on function public.fn_record_picking_print(text, text, text, integer, text, text, text, text) from public, anon;
-- Solo service_role: la llama el servidor. Ver la auditoría del 15/10 (se cerró a anon).
grant execute on function public.fn_record_picking_print(text, text, text, integer, text, text, text, text) to service_role;
