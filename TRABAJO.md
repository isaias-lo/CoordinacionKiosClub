# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-15
Rama: controlv3

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
