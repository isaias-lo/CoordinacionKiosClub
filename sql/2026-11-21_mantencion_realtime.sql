-- Mantención · el tablero de Jesús se actualiza solo.
--
-- `useCambiosMant` (src/features/mantencion/useCambiosMant.ts) escucha cambios por Supabase
-- Realtime. Una tabla que NO está en la publicación `supabase_realtime` no da error al suscribirse:
-- simplemente no llega nada, y el tablero se queda quieto hasta que alguien vuelve a la pestaña.
--
-- Realtime respeta el RLS de cada tabla: Jesús recibe todo (`mant_ve_todo()`), un supervisor solo
-- lo de sus tiendas. No abre nada que la lectura normal no abra ya.
--
-- Una sentencia por tabla para poder correrlas de a una (CLAUDE.md, regla 1) y para que la que ya
-- esté agregada no tumbe a las demás.

alter publication supabase_realtime add table mant_solicitudes;

alter publication supabase_realtime add table mant_comentarios;

alter publication supabase_realtime add table mant_fotos;

-- Control: tienen que salir las tres.
-- select tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and tablename like 'mant_%' order by 1;
