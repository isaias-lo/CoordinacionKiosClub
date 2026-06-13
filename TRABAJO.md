# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-13
Último commit: (pendiente commit)
Rama: inicio

## Archivos modificados recientemente

### Segunda Vuelta Reactiva + Fechas + CONTROL DESPACHO (plan parsed-swinging-robin.md)

**Infraestructura:**
- `supabase/migrations/043_segunda_vuelta.sql` — NUEVO: columnas fecha_armado + vuelta en despacho_rm/regiones
- `src/lib/userSessionState.ts` — Fuente ampliada con 'segunda_vuelta'

**Bodega Santiago:**
- `src/features/despacho/santiago/utils/sheetsSantiago.ts` — export buildRows + col AC fecha_armado
- `src/features/despacho/santiago/types/index.ts` — fechaDespacho + registrado en SantiagoState
- `src/features/despacho/santiago/context/SantiagoContext.tsx` — SET_FECHA_DESPACHO / SET_REGISTRADO + sync
- `src/features/despacho/santiago/pages/SantiagoPage.tsx` — selector fecha despacho + badge registrado
- `src/features/despacho/santiago/steps/StepResumen.tsx` — pasa fechas a sheets

**Bodega Regiones:**
- `src/features/despacho/regiones/utils/sheetsRegiones.ts` — export buildRows + col AC fecha_armado
- `src/features/despacho/regiones/pages/TiendasPage.tsx` — selector fecha despacho + badge registrado
- `src/context/AppContext.tsx` — SET_FECHA_DESPACHO / SET_REGISTRADO en reducer + sync Supabase
- `src/components/modals/FinishModal.tsx` — quita CLEAR_ALL/router.push, SET_REGISTRADO, pasa fechas
- `src/types.ts` — fechaDespacho + registrado en AppState

**Enrutador:**
- `src/features/despacho/rutas/RutasScreen.tsx` — pendientesV2 Supabase, CONTROL DESPACHO step 5, vuelta en PATCH
- `src/features/despacho/rutas/components/FlotaGrid.tsx` — texto TLBD actualizado

**API Routes:**
- `src/app/api/sheets-write/route.ts` — CONTROL DESPACHO handler + fecha_armado en Bodega upsert
- `src/app/api/despacho-records/route.ts` — PATCH acepta vuelta
- `src/app/api/auto-register-bodega/route.ts` — NUEVO: cron auto-registro 10 PM

**Manifiesto QR:**
- `src/app/r/[token]/page.tsx` — rediseño profesional: fondo blanco, documento corporativo, botón imprimir

**Infraestructura Vercel:**
- `vercel.json` — cron 0 2 * * 1-5 para auto-register-bodega
- `.env.local` — CRON_SECRET generado

## Pendiente CRÍTICO
- **Aplicar migración 043_segunda_vuelta.sql** via Supabase Dashboard (MCP apply_migration)
- **Agregar CRON_SECRET en Vercel Dashboard** → Settings → Environment Variables
- Verificar que hoja "CONTROL DESPACHO" existe en Google Sheets con columnas Fecha|Día|Tienda|Pallets|Bultos|Patente 1.Vuelta|Patente 2.Vuelta
- Agregar columna AC "FECHA ARMADO" en hojas DESPACHO RM y DESPACHO REGIONES

## Próximos pasos (no urgentes)
- Commit + push de todos los cambios
- Test end-to-end: fecha despacho en Bodega → verificar col A de DESPACHO RM = mañana, col AC = hoy
- Test cross-device pendientes: calcular rutas lunes → abrir Enrutador martes → ver badge 2ª vuelta
