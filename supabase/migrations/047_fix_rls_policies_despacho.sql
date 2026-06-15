-- 047 — Restaura políticas RLS faltantes
--
-- Estas 4 tablas tenían RLS habilitado pero CERO políticas → Postgres denegaba
-- todo acceso del rol `authenticated` (403 en el cliente). Se restaura el mismo
-- patrón que ya usa `shared_session_state`: acceso completo para authenticated.
--
-- Aplicado a producción (proyecto aiclobncdhxjxdlvkezk) vía MCP el 2026-06-15.

drop policy if exists "despacho_sesion_auth_all" on public.despacho_sesion;
create policy "despacho_sesion_auth_all" on public.despacho_sesion
  for all to authenticated using (true) with check (true);

drop policy if exists "despacho_rm_auth_all" on public.despacho_rm;
create policy "despacho_rm_auth_all" on public.despacho_rm
  for all to authenticated using (true) with check (true);

drop policy if exists "despacho_regiones_auth_all" on public.despacho_regiones;
create policy "despacho_regiones_auth_all" on public.despacho_regiones
  for all to authenticated using (true) with check (true);

drop policy if exists "ruta_tiendas_auth_all" on public.ruta_tiendas;
create policy "ruta_tiendas_auth_all" on public.ruta_tiendas
  for all to authenticated using (true) with check (true);
