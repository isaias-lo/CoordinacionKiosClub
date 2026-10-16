-- Volver a publicar en Realtime las tablas que la app escucha. APLICADO en producción el
-- 16/10/2026 13:10 UTC, con el OK de Isaias.
--
-- Desde la migración al proyecto nuevo (28/09/2026) la publicación `supabase_realtime` quedó VACÍA:
-- al copiar el esquema no se copió. Ninguna suscripción `postgres_changes` del código recibía
-- eventos, así que los equipos solo se enteraban de los cambios de otros cuando volvían a consultar
-- por su cuenta. Es la razón de fondo de las pisadas de Bodega del 14/10 (01TPS). Hallazgo de la
-- auditoría del 15/10 (/mnt/project-files/rutas/auditoria-base-15oct.md).
--
-- Son las 15 tablas con `postgres_changes` en `src/` al 16/10. Las 15 tienen RLS con lectura para
-- `authenticated` (o pública): Realtime respeta RLS, y sin eso el evento no llega aunque esté
-- publicada. `relreplident` queda en 'd', igual que en 2026-09-03_despacho_sesion_realtime.sql.
--
-- Una tabla nueva que la app escuche con `postgres_changes` hay que agregarla acá también.
--
-- Reversible:  ALTER PUBLICATION supabase_realtime DROP TABLE public.<tabla>;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.actividad_bodega,
  public.audit_active_sessions,
  public.audit_entries,
  public.calendario_armado,
  public.calendario_central,
  public.calendario_congelados,
  public.calendario_notificaciones,
  public.despacho_regiones,
  public.despacho_rm,
  public.despacho_sesion,
  public.dispatch_history,
  public.picking_pallets,
  public.picking_session_state,
  public.recepcion,
  public.shared_session_state;

-- Comprobación: debe devolver 15.
select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
