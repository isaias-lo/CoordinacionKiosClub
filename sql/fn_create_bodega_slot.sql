-- [RC-4] Alta ATÓMICA de un slot de Bodega.
--
-- Problema: /api/picking-pallets/create-bodega calculaba el seq como "count(activos del
-- mismo tipo) + 1" con un read-then-insert NO atómico. Con varios usuarios agregando a la
-- vez para la misma (fecha, tienda, tipo), dos altas leían el mismo count y creaban slots
-- con el MISMO seq/canonical_id → "agrego un CH y se duplica".
--
-- Solución: un advisory lock por (fecha|tienda|tipo) serializa las altas concurrentes dentro
-- de la transacción, y el seq se calcula + inserta sin carrera. Devuelve la fila completa.
--
-- Es idempotente de definición (CREATE OR REPLACE). Correr una vez en el SQL Editor de Supabase.
-- El route llama esta función y, si no existe (PGRST202), cae a un fallback no atómico, así
-- que se puede mergear el código antes o después de correr esto sin romper nada.

create or replace function fn_create_bodega_slot(
  p_date       text,
  p_store_cod  text,
  p_tipo       text,
  p_contenido  text default 'hogar'
)
returns setof picking_pallets
language plpgsql
as $$
declare
  v_seq       int;
  v_stamp     text;
  v_canonical text;
begin
  -- Serializa las altas concurrentes del mismo (fecha, tienda, tipo) → sin seq duplicado.
  perform pg_advisory_xact_lock(hashtextextended(p_date || '|' || p_store_cod || '|' || p_tipo, 0));

  -- Siguiente seq. `date::text = p_date` funciona sea la columna date o text.
  select coalesce(max(seq), 0) + 1
    into v_seq
    from picking_pallets
   where date::text = p_date
     and store_cod  = p_store_cod
     and tipo       = p_tipo
     and is_active  = true;

  -- stamp DDMMYYYY a partir de 'YYYY-MM-DD' (igual que el código TS).
  v_stamp := substr(p_date, 9, 2) || substr(p_date, 6, 2) || substr(p_date, 1, 4);

  -- canonical_id EXACTAMENTE como buildCanonical() del route.
  v_canonical := case p_tipo
    when 'P'  then 'P'  || v_seq || p_store_cod || v_stamp || 'P'
    when 'B'  then          v_seq || 'B' || p_store_cod || v_stamp || 'B'
    when 'CH' then 'CH' || v_seq || p_store_cod || v_stamp || 'CH'
    when 'C'  then 'C'  || v_seq || p_store_cod || v_stamp || 'C'
    else               v_seq || p_store_cod || v_stamp
  end;

  return query
  insert into picking_pallets
    (date, store_cod, state_key, picker_label, tipo, contenido, refs, seq, canonical_id, is_active)
  values
    (p_date::date, p_store_cod, p_store_cod || '__bodega', 'Bodega', p_tipo,
     coalesce(p_contenido, 'hogar'), '', v_seq, v_canonical, true)
  returning *;
end;
$$;
