# Estado actual del trabajo

## Última sesión
Fecha: 2026-07-16
Último commit: fix(guias): detectar código de tienda completo (número inicial + final) al subir guías
Rama: fix/codigo-tienda-numero

## Archivos modificados recientemente
src/features/despacho/rutas/utils/helpers.ts (nuevo matchCodArchivo)
src/features/despacho/rutas/utils/__tests__/matchCodArchivo.test.ts (12 tests)
src/features/despacho/regiones/pages/TiendasPage.tsx (usa helper)
src/features/despacho/santiago/steps/StepForm.tsx (usa helper)

## En progreso
Fix código tienda al subir guías PDF: "38SP2" ya no se lee como "38SP" ni se confunde con
"24SPP". `matchCodArchivo()` elige el código CONOCIDO más largo que sea prefijo del nombre
(número inicial + letras + dígito final, con límite no-alfanumérico) + fallback alias
(38PSP→38SP2, 35BNT→35BN2). Aplicado en Nacional (TiendasPage) y RM/Costa (StepForm).
Verificado: tsc/lint/build OK, 467 tests (12 nuevos). → PR pendiente de abrir.

## Próximos pasos
1. **PR 2 — `style/app-shell-enterprise`:** AppSidebar, AppShell, PageHeader, HubPage
   (elevación/densidad sobria, estado activo claro, menú móvil consistente).
2. PR 3 — login/auth. PR 4 — Panel Operaciones. PR 5 — recepción/conductor móvil.
   PR 6 — auditoría. PR 7 — control interno. PR 8 — enrutador polish.
