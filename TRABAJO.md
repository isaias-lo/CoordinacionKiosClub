# TRABAJO — Estado actual

## Sesión: Calendario Central → CalendarioColumnas + build fixes

### Branch: `inicio`

### Cambios realizados (sesión actual):

| Archivo | Cambio |
|---------|--------|
| `src/app/admin/calendario/page.tsx` | Reemplazado `CalendarioCentral` por `CalendarioColumnas` con `source="despacho"` — ahora tiene selector de días (stepper 1–7), drag & drop posicional con indicadores azules, pestañas de grupos, selector multi-día al agregar tienda, guardado con Supabase + Sheets, y diseño completo estilo CalendarioArmado |
| `src/features/control-interno/CalendarioCentral.tsx` | Fix: sintaxis JSX (comentario fuera de lugar, regex emoji roto, variable `i` no usada) — build compila |
| `TRABAJO.md` | Actualizado |

### Pendiente
- ⚠️ **CORS en Vercel** — Login bloqueado en `toolskios.vercel.app`. Solución: Cambiar Site URL en Supabase Dashboard → Configuration → API de `http://localhost:3000` a `https://toolskios.vercel.app`
- Commit, push y deploy de rama `inicio` para llevar los cambios a producción

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
- ✅ `npm run lint` — Pasado

## Pendiente
- ⚠️ **CORS en Vercel** — Login bloqueado en `toolskios.vercel.app`. **Solución**: Cambiar Site URL en Supabase Dashboard → Configuration → API de `http://localhost:3000` a `https://toolskios.vercel.app`
- Los cambios de esta sesión están en rama `inicio`, sin commitear ni desplegar

## Próximos pasos posibles
- Verificar login en Vercel tras cambio de Site URL
- Monitorear I/O de Supabase tras optimizaciones
- Commit y push de rama `inicio` → PR a `main`
