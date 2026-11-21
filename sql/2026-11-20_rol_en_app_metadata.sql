-- [ROL EN app_metadata] Copia inicial del permiso de cada usuario, de user_metadata a app_metadata.
--
-- POR QUÉ: hasta hoy el rol vivía en `user_metadata`, y ese campo lo escribe EL PROPIO USUARIO
-- desde el navegador (`supabase.auth.updateUser({ data: { role: 'admin' } })`). Cualquiera con
-- sesión podía darse admin. El código ahora lee SOLO `app_metadata`, que escribe el servidor.
-- Ver `src/lib/permisoUsuario.ts`.
--
-- ══ ORDEN, Y POR QUÉ IMPORTA ════════════════════════════════════════════════════════════════
--
--   1. Correr ESTO, con el código viejo todavía en producción. No cambia nada visible: el código
--      viejo no lee `app_metadata`.
--   2. Esperar AL MENOS UNA HORA antes de mergear el PR. El middleware lee la sesión de la cookie
--      (`getSession`, no `getUser`), y un token emitido antes del paso 1 no trae el rol en
--      `app_metadata` hasta que se refresca, que pasa al vencer: ~1 h. Si se mergea antes, quien
--      tenga un token viejo entra como 'auditor' hasta que se le refresque.
--   3. Entre el paso 1 y el merge, NO cambiar roles desde el panel: el código viejo escribe solo
--      en `user_metadata`, y como esto no pisa un `app_metadata.role` ya puesto, el cambio no
--      llegaría. Si hubo que cambiar uno, la consulta de control de abajo lo muestra.
--
-- ══ QUÉ COPIA ═══════════════════════════════════════════════════════════════════════════════
--
-- Las cuatro claves del permiso: role, allowed_paths, home_path, permissions. `full_name` NO:
-- el nombre sí es del usuario y se queda en `user_metadata`.
--
-- Las copias viejas en `user_metadata` NO se borran acá: el código que está en producción en el
-- paso 1 todavía las lee. Se limpian después del merge (consulta al final), y mientras tanto no
-- las lee nadie.
--
-- Idempotente: solo toca a quien todavía no tiene `app_metadata.role`. Correrlo dos veces no
-- cambia nada la segunda.
--
-- OJO: esto copia lo que HOY dice `user_metadata`, que es justamente el campo que cualquiera podía
-- escribir. Antes de correrlo, revisar la lista de admins (medido el 20/11/2026: 6 —
-- coordinacioncd, despachocd, pickingcd, ssanchez @kiosclub.com, isaiaslozada19 y
-- sebastianalumno @gmail.com). Si alguno no debería serlo, se corrige ANTES desde el panel.

update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
       || jsonb_strip_nulls(jsonb_build_object(
            'role',          u.raw_user_meta_data -> 'role',
            'allowed_paths', u.raw_user_meta_data -> 'allowed_paths',
            'home_path',     u.raw_user_meta_data -> 'home_path',
            'permissions',   u.raw_user_meta_data -> 'permissions'))
 where u.raw_user_meta_data ? 'role'
   and not (coalesce(u.raw_app_meta_data, '{}'::jsonb) ? 'role');

-- ══ CONTROL (una sentencia por llamada) ═════════════════════════════════════════════════════
--
-- Tiene que dar CERO filas: nadie con rol distinto entre los dos lados.
--
--   select email, raw_user_meta_data->>'role' as um, raw_app_meta_data->>'role' as am
--     from auth.users
--    where raw_user_meta_data->>'role' is distinct from raw_app_meta_data->>'role';
--
-- ══ LIMPIEZA, DESPUÉS DEL MERGE Y CON EL CONTROL EN CERO ════════════════════════════════════
--
--   update auth.users
--      set raw_user_meta_data = raw_user_meta_data
--          - 'role' - 'allowed_paths' - 'home_path' - 'permissions'
--    where raw_user_meta_data ?| array['role', 'allowed_paths', 'home_path', 'permissions'];
--
-- OJO con la limpieza: el trigger `handle_new_user` llena `profiles.role` desde
-- `raw_user_meta_data->>'role'` al crear un usuario. `profiles` ya está vieja (12 de 20 en
-- «pending» el 19/11) y no la lee ningún permiso, pero sin el rol ahí las filas nuevas nacerán
-- 'auditor'. No cambia ningún acceso.
