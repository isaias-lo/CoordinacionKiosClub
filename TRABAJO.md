# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-16
Rama: feat/cierre-jornada (creada desde main/inicio sincronizado)

## Completado en esta sesión (rama feat/cierre-jornada) — Punto 4: Cierre de jornada

Contexto: puntos 1, 2, 3 y 5 ya están en `main` (PRs #31/#32/#33, commit 7e8b66f). Rama `inicio`
sincronizada a main (fast-forward). Esta sesión implementa el **punto 4** (flujo de despacho completo).

**Investigación 2ª vuelta (recolección de datos):** el `vuelta` (1/2) nace de marcar TLBD en Flota y se
reparte a HISTORIAL (evento por ruta), CONTROL DESPACHO (v1/v2 patente por tienda), Supabase
`despacho_rm.vuelta` (write-only, nadie lo lee) y `shared_session_state('segunda_vuelta')` (pendientes
cross-device). **Decisión: NO migrar a per-pallet** (el Enrutador rutea por tienda, no por pallet; la
columna no se consume; los Sheets ya capturan ambas vueltas bien).

**Cambios:**
- `src/features/despacho/rutas/utils/vueltaIntegrity.ts` (NUEVO) — `idsActualizables()`: en carga extra
  (2ª vuelta) NO se pisan filas ya despachadas en 1ª vuelta (las que ya tienen conductor). + tests.
- `src/app/api/despacho-records/route.ts` — usa el helper; protege también `picking_pallets` en carga extra.
- `src/features/despacho/rutas/components/CierreJornadaPanel.tsx` (NUEVO) — resumen 1ª/2ª vuelta,
  pendientes (reusa `pendientesV2`/`segunda_vuelta`), guía de carga extra, botón "Listo por hoy".
- `src/features/despacho/rutas/components/ResultsSection.tsx` — botón "🏁 Cierre de jornada" + panel.
- `src/features/despacho/rutas/RutasScreen.tsx` — estado `cerrado` + `handleListoPorHoy` (marca cross-device
  en `shared_session_state` fuente `cierre`) + lectura del marcador.
- `supabase/migrations/049_picking_slot_id_despacho_regiones.sql` — renombrada desde 048 (había DOS 048).

**231/231 tests pasan · tsc limpio · build OK.**

## Archivos modificados recientemente
.claude/settings.local.json
supabase/migrations/046_rls_calendario_armado_notificaciones.sql

## Completado en esta sesión (rama controlv3)
Todos los cambios están en la rama `controlv3`, pendiente de PR a main.

### Control Cruce — bugs y feature

**Bugs corregidos:**
- fix: CORRECTA DEC. aparecía en blanco para actividades COMPLETADO
  → agregado 'ACTIVIDAD REALIZADA' a CORR_OPTS (controlled select sin option matching)
- fix: DETALLE mostraba "TO DO" para actividades VENCIDA/PLANIFICADO
  → eliminado fallback `activity_type_id[1]` en `/api/odoo` route (get_control_activities)
- fix: exportación manual no incluía filas VENCIDA/PLANIFICADO con el checkbox activo
  → `currentRows` ya filtraba correctamente (era cosmético, no bug real)

**Feature nueva: Auto-export diario a Google Sheets:**
- `supabase/migrations/048_control_cruce_config.sql` — tabla `control_cruce_config`
- `src/app/api/control-cruce/auto-export/route.ts` — GET (cron + config), POST (forzar), PATCH (config)
- `src/app/api/control-cruce/export-sheets/route.ts` — soporte para `tabName` (pestaña por fecha)
- `vercel.json` — cron horario `0 * * * *`
- `src/features/control-interno/ControlCruceContent.tsx` — panel UI con toggle, hora, "Exportar ayer", modal confirmación

**225/225 tests pasan.**

## Pendiente antes de PR / deploy
1. **Aplicar migración 048** en Supabase (dashboard → SQL editor o `supabase db push`)
2. **Agregar `CRON_SECRET`** en Vercel → Settings → Environment Variables
3. **Agregar `GOOGLE_CONTROL_CRUCE_SHEET_ID`** si no existe (el Spreadsheet ID del sheet de control cruce)
4. Abrir PR controlv3 → main cuando esté listo

## Próximos pasos (sin urgencia)
1. Deuda diferida: refactor componentes monolíticos (StepForm ~2384 líneas, AuditoriaScreen ~2400)
2. Seguridad menor: Leaked Password Protection, buckets públicos, search_path en funciones
