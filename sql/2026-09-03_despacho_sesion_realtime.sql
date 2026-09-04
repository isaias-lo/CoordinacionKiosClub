-- [Fase 0] Habilitar Realtime en `despacho_sesion`.
--
-- El Enrutador se suscribe a esta tabla (`subscribeToSesion`) para recibir los conteos que Bodega
-- va registrando durante la mañana. Pero la tabla NO está en la publicación `supabase_realtime`,
-- así que esa suscripción nunca dispara: el pool se carga UNA sola vez, en el fetch inicial de
-- 1,5 s al montar la pantalla.
--
-- Consecuencia: dos equipos abiertos a horas distintas ven pools distintos, y ninguno se entera de
-- lo que Bodega agrega después. Parte de por qué "todo asignado" significaba cosas distintas en
-- cada pantalla.
--
-- Verificado antes de escribir esto: de las 16 tablas publicadas, `despacho_sesion` no aparece.
--
--   select tablename from pg_publication_tables
--    where pubname = 'supabase_realtime' and schemaname = 'public';
--
-- Es reversible:  ALTER PUBLICATION supabase_realtime DROP TABLE public.despacho_sesion;
--
-- Nota: `relreplident` está en 'd' (default), suficiente para INSERT y UPDATE, que es lo que el
-- Enrutador escucha. Si algún día hiciera falta el payload de los DELETE, habría que poner
-- REPLICA IDENTITY FULL — no hace falta hoy.

ALTER PUBLICATION supabase_realtime ADD TABLE public.despacho_sesion;

-- Comprobación: debe devolver una fila.
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and schemaname = 'public'
   and tablename = 'despacho_sesion';
