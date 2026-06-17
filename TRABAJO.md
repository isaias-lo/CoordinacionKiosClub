# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-16 21:21
Último commit: feat(despacho+picking): guías en manifiesto, auditoría de pallets y 2ª vuelta por fecha de salida
Rama: inicio

## Archivos modificados recientemente
.claude/settings.local.json
TRABAJO.md
TRABAJO_ERICK.md
src/app/api/despacho-records/route.ts
src/app/api/picking-eventos/route.ts
src/app/api/picking-pallets/route.ts
src/app/api/ruta-guias/route.ts
src/app/api/rutas-despacho/route.ts
src/features/despacho/estado/EstadoPage.tsx
src/features/despacho/regiones/pages/TiendasPage.tsx
src/features/despacho/rutas/RutasScreen.tsx
src/features/despacho/rutas/components/InputSection.tsx
src/features/despacho/santiago/steps/StepForm.tsx
src/features/picking/PickingScreen.tsx
src/features/picking/__tests__/detectarReincidencia.test.ts
src/features/picking/components/ActivityTab.tsx
src/features/picking/picking-utils.ts
src/lib/__tests__/fechaChile.test.ts
src/lib/__tests__/rutaGuiaMatch.test.ts
src/lib/fechaChile.ts
src/lib/rutaGuiaMatch.ts
src/lib/schemas.ts
supabase/migrations/050_picking_eventos.sql
supabase/migrations/051_guias_subidas.sql

## En progreso
Rama: fix/egress-realtime-polls — reducción de egress de Supabase (org pasó cuota Free, gracia hasta 14-jul-2026).
Pendiente: PR a main.

### Optimizaciones de egress aplicadas (2026-06-17)
Auditoría: el egress estaba en 6.66/5 GB (133%). Drivers identificados y corregidos (puntos 1a, 2, 3):
- **Punto 2 — poll condicional a Realtime:** `subscribeToSessionState` ahora reporta estado de
  conexión (`onStatus`). En `AppContext` (regiones) y `SantiagoContext` (santiago) el poll de 15s
  de `shared_session_state` SOLO corre si el WebSocket está caído (antes corría siempre y re-bajaba
  el blob completo cada 15s por pestaña). Refetch único al reconectar para no perder cambios.
- **Punto 1a — debounce del push 800ms → 2.5s:** menos rebroadcasts del blob completo por Realtime
  a cada suscriptor. flushPending + localStorage en unmount garantizan que no se pierde data.
- **Punto 3 — badge de pending:** nuevo modo `GET /api/admin/users?count=pending` (devuelve solo el
  número). `ProfilePill` y `LaunchScreen` lo usan y subieron el intervalo de 30s → 5min (10× menos
  llamadas a Auth listUsers, que es el tramo de egress dominante). Nota: el conteo sigue vía
  listUsers porque los pending se crean en /api/auth/register SIN escribir en `profiles`.
- Punto 1b (deltas vía Broadcast en vez de fila completa) queda como mejora futura si aún no alcanza.
- 247/247 tests · tsc limpio · build OK.

[actualizar manualmente o con comando bye]

## Migraciones aplicadas en prod (toolskios)
- 2026-06-17: **050_picking_eventos** y **051_guias_subidas** aplicadas manualmente vía SQL Editor
  (el MCP de Supabase no estaba operativo). Verificado: tablas + índices custom
  (idx_picking_eventos_date, idx_guias_subidas_store_fecha) + RLS ON + políticas *_auth_all (ALL).
  Nota: el Admin API de Supabase tuvo degradación ese día ("Failed to fetch"), pero el SQL entró completo.

## Bugs de estados falsos en verde — CORREGIDOS (2026-06-17, rama fix/egress-realtime-polls)
Tres causas, tres fixes (247/247 tests · tsc · build OK):
- **Parpadeo verde↔naranja (doble escritor):** `picking_session_state(odoo-progress)` lo escribían DOS
  fuentes con `total` calculado distinto — el refresco batch del GET (`resolveStoreCode`, todas las
  tiendas) y un POST de PickingScreen (ops cargadas por el picker). Se pisaban → semáforo inestable.
  Fix: **fuente única** = el batch del GET. Eliminado el POST de PickingScreen (`PickingScreen.tsx:717`)
  y el handler POST del endpoint. Semáforo estable; refresco ≤60s. (Si se quiere update instantáneo,
  habría que unificar la atribución de tiendas antes de reponer un escritor.)
- **Tiendas de días anteriores reaparecían:** `EstadoPage.loadSantiagoItems` caía al fallback legacy sin
  fecha `localStorage('santiagoState')`. Fix: usar solo la clave con fecha `santiagoState_${TODAY_KEY}`.
- **Staleness de fecha a nivel de módulo:** las constantes `todayKey`/`TODAY_KEY` se calculan al cargar el
  bundle; pestaña abierta cruzando medianoche → guías/estado del día anterior. Fix: nuevo hook
  `useDayRollover` (src/hooks) que recarga al volver el foco si cambió el día; montado en StepForm
  (Santiago), EstadoPage y TiendasPage (Regiones).
- Pendiente opcional: definir si el semáforo debe ocultarse en tiendas NO asignadas a una ruta (hoy el
  verde refleja "picking terminado en Odoo", independiente de asignación). Confirmar regla con el usuario.
- **Enrutador (tab MANUAL) arrastraba tiendas de ayer con cantidades:** `RutasScreen` calcula `today` al
  montar (`today = todayStr()`, línea 315) y `applyRow` INYECTA en `calT` toda tienda con counts en
  `despacho_sesion(today)` aunque no esté en el calendario. Con la pestaña abierta cruzando medianoche,
  `today` quedaba en ayer → traía counts de ayer. Fix: montar `useDayRollover` también en RutasScreen.
  OJO residual: si una bodega con pestaña vieja alcanzó a pushear items de ayer con fecha de HOY a
  `despacho_sesion`, esas filas quedan "contaminadas" y persisten aun con hard-reload hasta limpiarlas
  (el rollover en bodega evita que vuelva a pasar). Verificar con SQL si reaparecen tras Ctrl+Shift+R.

## Próximos pasos
1. Verificar en producción (tras deploy) que el semáforo ya NO parpadea y que en día nuevo no salen
   guías/estados fantasma. El rollover requiere que la pestaña recupere el foco (o pasen ≤5 min).
2. Opcional: decidir si el semáforo debe ocultarse en tiendas no asignadas a una ruta.
3. Deuda diferida: refactor componentes monolíticos (StepForm ~2384 líneas, AuditoriaScreen ~2400)
4. Seguridad menor: Leaked Password Protection, buckets públicos, search_path en funciones
