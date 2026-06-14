# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-13 16:01
Último commit: docs: actualizar TRABAJO.md — fase de seguridad (PR 1A/1B) completa
Rama: fix/seguridad-pr1b

## Archivos modificados recientemente
TRABAJO.md
src/app/api/calendario-write/route.ts
src/app/api/conductores/route.ts
src/app/api/conteo-consolidacion/route.ts
src/app/api/control-cruce/route.ts
src/app/api/control-flota/route.ts
src/app/api/dashboard-stats/route.ts
src/app/api/despacho-records/route.ts
src/app/api/drive-upload/route.ts
src/app/api/flota-cambios/route.ts
src/app/api/flota/export-sheets/route.ts
src/app/api/flota/route.ts
src/app/api/historial-despacho/route.ts
src/app/api/pallet-lookup/route.ts
src/app/api/panel-operaciones/route.ts
src/app/api/parametros-sistema/route.ts
src/app/api/personal/export-sheets/route.ts
src/app/api/picking-store-progress/route.ts
src/app/api/pionetas/route.ts
src/app/api/recepcion-otp/route.ts
src/app/api/ruta-eventos/route.ts
src/app/api/rutas-despacho/route.ts
src/app/api/seguimiento/route.ts
src/app/api/send-otp/route.ts
src/app/api/sheets-write/route.ts
src/app/api/sheets/route.ts
src/app/api/sync-despacho/route.ts
src/app/api/tiendas/export-sheets/route.ts
src/app/api/tiendas/route.ts
src/app/api/tiendas/sync/route.ts
src/app/api/trazabilidad/route.ts
src/components/AuthProvider.tsx
src/lib/__tests__/apiAuth.test.ts
src/lib/apiAuth.ts
src/lib/otpToken.ts
src/lib/sheetsTraza.ts

## En progreso
Correcciones del code review (211 issues). Fase de SEGURIDAD completa:
- Rama `fix/seguridad-pr1a`: auth en ~22 endpoints internos (verifyAuth/verifyAdmin
  ahora aceptan cookie de sesión, no solo Bearer), rate limit OTP, fix can(),
  otpToken timing-safe, sanitización Unicode (5 archivos), gmail env var.
- Rama `fix/seguridad-pr1b` (apilada sobre 1a): auth vía cookie en endpoints de
  chofer/tienda (rutas-despacho, flota GET, pallet-lookup, trazabilidad).
  Simplificado — NO se necesitó token HMAC porque esas páginas ya tienen sesión.
Ambas: build OK, 202 tests passing. Sin PR abierto aún.

## Próximos pasos
1. ⚠️ Smoke test en staging de flujos chofer/recepción tienda antes de mergear 1B.
2. PR 2: bugs de negocio (getDia domingo→LU, className roto en PickingSlotCards,
   XSS en pdfExport, setTimeout leak ManifiestoPanel, blob URLs RecepcionForm).
3. PR 3: error.tsx global + ErrorBoundaries + loading states.
4. PR 4: centralizar calcAuditado, documentar rateLimit, clamp limit en trazabilidad.
Plan completo: ~/.claude/plans/un-agente-reviso-el-scalable-hickey.md
