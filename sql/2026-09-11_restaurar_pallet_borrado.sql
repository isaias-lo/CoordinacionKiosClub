-- [9b · 2ª parte] Restaurar un pallet borrado DESPUÉS de los 7 s del snackbar "Revertir".
--
-- El borrado en picking_pallets es físico: la fila desaparece. El trigger de auditoría ya registraba
-- un evento 'eliminar' en CADA borrado —venga de Picking, de Bodega, de una suma o de la API—, pero
-- solo con tipo, tienda, encargado, quién y cuándo. Sin peso, medidas, número, sección ni guías, un
-- pallet borrado por error no se podía devolver: solo avisar que había existido (#453).
--
-- Ahora el trigger guarda además la fila completa (`datos`). Con eso el diálogo de preexistente
-- ofrece "Restaurar": el pallet vuelve con su MISMO id (picking_pallets.id es un serial común), su
-- número, su código de barras, su peso y sus medidas.
--
-- Costo medido el 11/09/2026: ~210 bytes por fila y ~60 borrados por día → ~25 KB por día.
--
-- Aditivo: una columna nullable, la función del trigger reescrita para llenarla, la restricción de
-- event_type ampliada con 'restaurar', y dos índices parciales. Se puede correr más de una vez.
--
-- ⚠️ Correr ANTES de desplegar el código que lee `datos`. El código tolera su ausencia (degrada al
-- mensaje de #453 sin botón), pero no ofrece restaurar hasta que esto exista.

-- 1) La copia de la fila borrada.
ALTER TABLE public.picking_eventos ADD COLUMN IF NOT EXISTS datos jsonb;
COMMENT ON COLUMN public.picking_eventos.datos IS
  'En ''eliminar'': la fila de picking_pallets tal como estaba (to_jsonb(OLD)). Permite restaurarla con su mismo id, número, peso y medidas.';

-- 2) 'restaurar' como evento válido, para que la línea de tiempo diga crear → eliminar → restaurar.
ALTER TABLE public.picking_eventos DROP CONSTRAINT IF EXISTS picking_eventos_event_type_check;
ALTER TABLE public.picking_eventos ADD CONSTRAINT picking_eventos_event_type_check
  CHECK (event_type = ANY (ARRAY['crear'::text, 'eliminar'::text, 'restaurar'::text]));

-- 3) El trigger guarda la fila completa. Misma función que ya existía, más `datos`.
--    El actor sigue saliendo de `app.actor` (set local en la transacción que borra).
CREATE OR REPLACE FUNCTION public.fn_audit_picking_pallet_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.picking_eventos
    (date, event_type, pallet_id, state_key, store_cod, tipo, picker_label, actor_name, datos)
  VALUES
    (OLD.date, 'eliminar', OLD.id, OLD.state_key, OLD.store_cod, OLD.tipo, OLD.picker_label,
     NULLIF(current_setting('app.actor', true), ''), to_jsonb(OLD));
  RETURN OLD;
END;
$function$;

-- Versionado acá por primera vez: el trigger existía en la base pero no en el repo.
CREATE OR REPLACE TRIGGER trg_audit_picking_pallet_delete
  AFTER DELETE ON public.picking_pallets
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_picking_pallet_delete();

-- 4) Buscar un borrado por su #número o por su código de barras sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS idx_picking_eventos_eliminar_pallet
  ON public.picking_eventos (pallet_id, created_at DESC) WHERE event_type = 'eliminar';
CREATE INDEX IF NOT EXISTS idx_picking_eventos_eliminar_canonical
  ON public.picking_eventos ((datos->>'canonical_id')) WHERE event_type = 'eliminar';
