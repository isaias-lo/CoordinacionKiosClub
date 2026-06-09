# TRABAJO — Estado actual

## Sesión: Fix Dashboard + Polling + 401 API

### Branch: `inicio`

### Cambios realizados:

| Archivo | Cambio |
|---------|--------|
| `src/hooks/queries/useHistorial.ts` | Corregidas columnas: `fecha`→`date`, eliminados `region`/`total_tiendas` (no existen en tabla `dispatch_history`) |
| `src/screens/LaunchScreen.tsx` | Chart ahora usa `useHistorial(90)` en vez de `useHistorialStats()` (no exponía `data`); filtro usa `r.date` |
| `src/hooks/queries/usePickingPallets.ts` | Eliminado `refetchInterval: 30_000` de `useTodayPickingPallets()`. **Fix 401**: `fetchPallets()` ahora envía `Authorization: Bearer <token>` igual que las mutations |

### Pendiente
- ⚠️ **CORS en Vercel** — Login bloqueado en `toolskios.vercel.app`. Solución: Cambiar Site URL en Supabase Dashboard → Configuration → API de `http://localhost:3000` a `https://toolskios.vercel.app`
- Commit, push y deploy de rama `inicio` para llevar las correcciones a producción
- Error 400 en `dispatch_history` (columnas viejas) se resolverá con el deploy
- Error 401 en `/api/picking-pallets` corregido, requiere deploy
- Revisar warning Recharts (width/height 0) en contenedor del chart

### Commits recientes:
| Commit | Descripción |
|--------|-------------|
| `f103956` | **Optimización I/O** — Filtros realtime + límites query + columnas específicas + batch paralelo |
| `dfb2397` | **Merge** — Fusión v2 → main, conflictos resueltos (despacho-hub, AppSidebar, PageHeader, LaunchScreen) |
| `99381f3` | **Fix middleware** — Timeout 12s `Promise.race` en `supabase.auth.getUser()` |
| `f9f93f6` | **Fase 6** — Remove legacy Button, add utility button classes |
| `f2e19fe` | **Fase 5** — Unificar gradientes y dark-surface tokens |
| `dcf835c` | **Fase 4** — Reorganizar sidebar en 3 grupos + Picking→Abastecimiento |

### Commits previos (ya integrados):
| Commit | Descripción |
|--------|-------------|
| `344b033` | Fix: pallet numbering skip (filter `is_active=true`) |
| `ad9ae6e` | Fix: SWC parse error (multiline template literals) |
| `2584704` | Fix: restaurar hasOdoo usando NEXT_PUBLIC_ODOO_URL |

---

## Resumen de Cambios

### Fase 1 — Eliminar Hub Despacho
- `/despacho-hub` eliminado de routes.ts
- `despacho-hub/page.tsx` → redirect a `/despacho`

### Fase 2 — Quitar ProfilePill
- Eliminado de 24 headers de página

### Fase 3 — Fusionar Historial + Registros
- 4 tabs: rm, regiones, recepcion, historial

### Fase 4 — Reorganizar Sidebar
- 3 nuevos grupos: Despacho, Flota, Seguimiento
- Picking → Abastecimiento

### Fase 5 — Unificar Gradientes
- CSS vars + 5 hardcoded gradients reemplazados

### Fase 6 — UI Components
- Button.tsx eliminado + utility classes `.btn-*`

### Optimización I/O Supabase (f103956)
- 5 subscriptions de picking_pallets con filtro `fecha+fuente`
- shared_session_state: filtro `fecha+fuente` en realtime
- useHistorial: `.limit(500)`
- PendingDraftBanner: `.limit(30)`
- panel-operaciones/pendientes: `.limit(500)` en todos los queries
- tiendas + export-sheets: columnas específicas en vez de `select('*')`
- picking-pallets PATCH: `Promise.all` paralelo

### Fix Middleware (99381f3)
- `supabase.auth.getUser()` con timeout 12s via `Promise.race`

### Merge v2 → main (dfb2397)
- Conflictos resueltos: despacho-hub, AppSidebar (mejoras origin/main), PageHeader (breadcrumbs), LaunchScreen (FEATURE_COLORS)

---

## Build Status
- ✅ `npm run build` — Compila sin errores
- ✅ TypeScript — Sin errores de tipo
- ✅ 52 páginas generadas
- ✅ `npm run lint` — Pasado

## Pendiente
- ⚠️ **CORS en Vercel** — Login bloqueado en `toolskios.vercel.app`. **Solución**: Cambiar Site URL en Supabase Dashboard → Configuration → API de `http://localhost:3000` a `https://toolskios.vercel.app`

## Próximos pasos posibles
- Verificar login en Vercel tras cambio de Site URL
- Monitorear I/O de Supabase tras optimizaciones
- Migrar `picking_fetch` timeout de 15s → 10s
- Consolidar patrones de tabs en componente TabBar reutilizable
