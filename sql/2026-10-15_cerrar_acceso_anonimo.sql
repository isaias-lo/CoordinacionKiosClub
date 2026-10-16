-- 2026-10-15 · Aplicado en producción (epiwlmegimfftivqzzup) el 15/10 a las 17:56 UTC, con OK de Isaias.
--
-- Con la clave pública de la app (va en el navegador) y sin iniciar sesión se podía leer
-- `otp_recepcion`, reescribir `config_despacho` y borrar cualquier pallet vía
-- `fn_delete_picking_pallet`. Las tablas y funciones de abajo solo las usa el servidor, que entra
-- con service role y no pasa por RLS: cerrarlas no cambia nada en la app.
--
-- Las políticas se pasan a `service_role` en vez de borrarse (el conector de Supabase se cuelga
-- con DROP). Reversible: `alter policy ... to public` y `grant execute ... to anon, authenticated`.
-- Informe completo: rutas/auditoria-base-15oct.md (carpeta del proyecto).

revoke execute on function public.fn_delete_picking_pallet(bigint, text) from public, anon, authenticated;
revoke execute on function public.fn_record_picking_print(text, text, text, integer, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_record_picking_print(text, text, text, integer, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.fn_audit_picking_pallet_delete() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

alter policy "Service role full access" on public.otp_recepcion to service_role;
alter policy "Admin escribe config despacho" on public.config_despacho to service_role;
-- config_despacho la escucha el navegador por Realtime (useRealtimeRefresh): lectura solo con sesión.
create policy "Lectura autenticada config_despacho" on public.config_despacho for select to authenticated using (true);
alter policy public_all_guides on public.guides to service_role;
alter policy public_all_stores on public.stores to service_role;
alter policy zonas_transporte_update on public.zonas_transporte to service_role;
alter policy traz_insert_any on public.trazabilidad_unidades to service_role;
alter policy traz_update_any on public.trazabilidad_unidades to service_role;
alter policy "Inserción autenticada o anónima" on public.ruta_eventos to service_role;
alter policy "Lectura pública de eventos" on public.ruta_eventos to service_role;
