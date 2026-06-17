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
[actualizar manualmente o con comando bye]

## Próximos pasos
1. Deuda diferida: refactor componentes monolíticos (StepForm ~2384 líneas, AuditoriaScreen ~2400)
2. Seguridad menor: Leaked Password Protection, buckets públicos, search_path en funciones
