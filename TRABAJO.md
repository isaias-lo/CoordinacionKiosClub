# TRABAJO — Estado actual

---

## Sesión: Control Cruce — Estado actividades + Filtro fechaArmado — 2026-06-11

### Cambios realizados

| Archivo | Cambio |
|---------|--------|
| `src/app/api/odoo/route.ts` | `get_control_activities` reescrito: filtra INT/MERMA pickings por `date_done` (no `mail.message.date`); tipos de actividad dinámicos desde `mail.activity.type`; agrega pendientes (`mail.activity`) si `incluyePendientes=true`; campo `estado: 'COMPLETADO' \| 'VENCIDA' \| 'PLANIFICADO'` en cada fila |
| `src/features/control-interno/ControlCruceContent.tsx` | Toggle "INCLUIR VENCIDAS/PLANIFICADAS" antes del botón cargar; columna ESTADO (última, sin export); `exportToSheet` filtra solo `estado === 'COMPLETADO'`; botón muestra "X completadas"; filtro de columna ESTADO en barra de filtros |

### Comportamiento

- **Filtro de fechas**: aplica sobre `date_done` del INT/MERMA picking (= fechaArmado real)
- **Sin toggle**: solo muestra actividades COMPLETADAS (comportamiento anterior)
- **Con toggle activo**: agrega filas VENCIDA/PLANIFICADO (de `mail.activity` en pickings `scheduled_date` en rango)
- **Export a Sheet**: siempre solo filas COMPLETADAS, independiente de filtros visibles
- **ESTADO column**: badge verde/rojo/amarillo, filtrable, nunca se exporta al Sheet

### Pendiente de configuración (manual)
1. `.env.local`: `GOOGLE_CONTROL_CRUCE_SHEET_ID=1hzEACZM31wubNgGhFibpnUlUYo0IYDM4OCYgtPBkxGg`
2. Compartir spreadsheet con `client_email` del service account (rol Editor)
3. Ejecutar migración `039_control_cruce_skus.sql` si no se ha hecho aún

---

## Sesión: Fix Dashboard + Polling + 401 API

## Sesión: 2026-06-09 — Bodegas + Picking (5 puntos) + flujo de trabajo

### Branch: `inicio`  ·  Deploy: lo de los 5 puntos ya está en `main` (commit `308f407`)

### Hecho en esta sesión (ya en producción / main):

| # | Punto | Resumen |
|---|-------|---------|
| 1 | Bug "agregados → formulario" | Bodegas (Santiago + Regiones): un ítem guardado SIEMPRE se muestra como tarjeta "Agregado". Match por `pickingSlotId` + respaldo por tipo/pkg. Ya no se degrada a formulario editable al navegar entre tiendas. |
| 2 | Chocolates automáticos | Los CH de Picking aparecen ya AGREGADOS a **20 kg** (editables con ✎). Clic en "Chocolate" agrega uno más al instante sin pedir peso y crea su ID de bodega. Peso reflejado en `picking_pallets`. Corregido que las tarjetas de chocolate desaparecían al salir/volver. |
| 3 | Crear IDs desde bodega | Botones P/B/C/CH → `create-bodega` (genera `seq` + `canonical_id`). Esos IDs (`state_key` `__bodega`) se EXCLUYEN de la vista de Picking; siguen en Bodega/Enrutador/Seguimiento. |
| 4 | Guía 35BN2 | Alias `35BNT → 35BN2` (BUENAVENTURA 2) en el matcheo de guías por nombre de archivo. |
| 5 | Quitar "Movimientos" de Picking | Eliminado todo: pestaña, estados (`manualOps`, `movNuevos`, `seenMovIds`), `addManualMovement`, panel `MovimientosOdooPanel`, acción Odoo `picking_move_products`. Sin tablas Supabase. |

### Archivos clave tocados:
- `src/features/despacho/santiago/steps/StepForm.tsx`
- `src/features/despacho/regiones/pages/TiendasPage.tsx`
- `src/features/picking/PickingScreen.tsx`
- `src/app/api/odoo/route.ts` (quitada acción `picking_move_products`)
- Eliminado: `src/features/picking/components/MovimientosOdooPanel.tsx`

### En esta sesión (solo en rama `inicio`, aún NO en main):
- **Flujo de trabajo entre equipos:** `FLUJO.md` (guía), `scripts/hola.ps1`, `scripts/bye.ps1`, comandos `npm run hola` / `npm run bye`.
- Actualizadas las bitácoras `TRABAJO.md` y `TRABAJO_ERICK.md`.

### Pendiente / próximos pasos:
- Probar en vivo: chocolates a 20 kg, IDs de bodega (que NO salgan en Picking), guía 35BN2, y que Movimientos ya no exista en Picking.
- Adoptar **flujo de PR**: trabajar en rama del día, **no** mergear directo a main; abrir PR con `gh pr create` y mergear desde GitHub (Vercel despliega `main`).

### Sesión: Control Cruce — UX Enterprise + Bugs — 2026-06-10

#### Bugs corregidos

| Bug | Archivo | Descripción |
|-----|---------|-------------|
| Race condition `saveManual` | `ControlCruceContent.tsx` | `setManualMap` ahora usa updater funcional — elimina sobreescritura de campos al editar dos celdas rápido |
| `exportToSheet` stale closure | `ControlCruceContent.tsx` | Lee `table.getFilteredRowModel()` en el momento del click, no desde closure |
| `loadSkuCounts` URL overflow | `ControlCruceContent.tsx` + `skus/route.ts` | Cambiado a POST con body para evitar error 414 con 200+ pickings |
| `removeSku` sin check HTTP | `SkuModal.tsx` | Verifica `res.ok` antes de quitar el chip de la UI |
| `rowsWritten` incorrecto | `export-sheets/route.ts` | Reporta `dataRows.length` (filas reales con SKUs expandidos) |
| Validación fechas | `ControlCruceContent.tsx` | Bloquea carga si `dateFrom > dateTo`; borde rojo en inputs |

#### Mejoras UX Enterprise

| Mejora | Descripción |
|--------|-------------|
| Barra de filtros de columna | DETALLE, AUDITADO, CORRECTA DEC., TIENDA, RESPONSABLE — dinámicos desde datos |
| Paginación | 25/50/100/200 filas por página con controles primera/última |
| Fila guardando | Resalte amarillo en la fila que se está persistiendo en Supabase |
| Empty state filtros | Mensaje + botón limpiar cuando ninguna fila pasa los filtros activos |
| Debug gated por rol | Panel debug solo visible para `role === 'admin'` |
| Escape en SkuModal | `Escape` cierra el modal; delete con doble-click (confirmación inline 2.5s) |

---

### Sesión: Control Cruce — Filtros + Append — 2026-06-10

#### Cambios realizados

| Archivo | Cambio |
|---------|--------|
| `src/features/control-interno/ControlCruceContent.tsx` | Eliminado input `IDs Tipo` (state + label); agregado filtro de fechas `dateFrom`/`dateTo` con 2 inputs date; pasadas fechas al fetch de Odoo |
| `src/app/api/odoo/route.ts` | `get_control_activities` ahora usa `dateFrom`/`dateTo` del body en vez del `oneWeekAgo` hardcoded |
| `src/app/api/control-cruce/export-sheets/route.ts` | Exportación cambiada de `clear+update` a `append`; columna `FECHA EXPORTACIÓN` agregada; headers solo se escriben si la hoja está vacía |

#### Funcionalidad
- **Filtro fecha**: Selección de rango "DESDE" / "HASTA" para cargar actividades de Odoo por período específico
- **Export append**: Cada export agrega filas al final del Sheet (no sobreescribe). Ideal para carga diaria acumulativa
- **Columna fecha**: Cada fila exportada incluye la fecha de exportación para trazabilidad

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
- Auditar el uso de `.btn-*` classes existentes y migrar los más repetitivos

---

## Sesión: Fix saturación Supabase — 2026-06-09

### Problema
El servidor Supabase se saturaba. Diagnóstico: exceso de polling y suscripciones redundantes.

### Fixes aplicados

#### Código
| Archivo | Cambio |
|---------|--------|
| `src/hooks/useRealtimeRefresh.ts` | Polling ahora **condicional**: solo dispara cuando el WebSocket está desconectado (`status !== 'SUBSCRIBED'`). Antes siempre hacía polling cada 15s aunque realtime funcionara — 6 instancias en PickingScreen = 24 queries DB/min por usuario. Al reconectar hace un refresh para recuperar cambios perdidos. |
| `src/features/despacho/santiago/context/SantiagoContext.tsx` | Poll de sesión Santiago: **3s → 15s**. El mismo motivo que ya estaba documentado en AppContext: "3s fue demasiado agresivo". Con múltiples usuarios en Santiago generaba ~20 queries DB/min c/u solo para sync de estado. |

#### Base de datos (migración `fix_rls_auth_initplan`)
RLS policies en `profiles`, `audit_entries`, `dispatch_history`, `audit_active_sessions` usaban `auth.uid()` / `auth.role()` directamente, lo que hace que Postgres las re-evalúe **por cada fila escaneada**. Fix: envolver en `(select auth.uid())` para evaluación única por query.

### Sesión: Control Cruce — SKU múltiple + fix export — 2026-06-10

#### Bug fix: export mezclaba SKUs entre Faltantes/Sobrantes
- **Causa**: SKUs se guardaban solo por `picking_name`, pero un mismo picking puede tener múltiples `detalle` (Faltantes, Sobrantes, Merma)
- **Fix**: Columna `detalle` agregada a `control_cruce_skus`; SKUs ahora son por `picking_name + detalle`

#### Cambios realizados

| Archivo | Cambio |
|---------|--------|
| `supabase/migrations/039_control_cruce_skus.sql` | Tabla con columna `detalle NOT NULL DEFAULT ''` + índice compuesto `(picking_name, detalle)` |
| `src/app/api/control-cruce/skus/route.ts` | GET filtra por `picking_name + detalle`; POST incluye `detalle`; endpoint `?action=counts` para conteo bulk |
| `src/app/api/control-cruce/export-sheets/route.ts` | Fetch SKUs por `picking_name + detalle` en vez de solo `picking_name` |
| `src/features/control-interno/components/SkuModal.tsx` | Recibe `detalle` como prop; header muestra badge del tipo de detalle; filtra SKUs por detalle |
| `src/features/control-interno/ControlCruceContent.tsx` | Pasa `detalle` al modal; state `skuCounts` con conteo bulk; botón muestra "2 SKUs" o "Agregar SKU" |
| `src/features/control-interno/components/SkuModal.tsx` | **Nuevo** — Modal con lista de chips SKU (X para quitar) + input para agregar |
| `src/features/control-interno/ControlCruceContent.tsx` | Columna SKU: de EditableCell a botón que abre SkuModal; estados `skuModalOpen`/`skuModalPick` |

#### Funcionalidad
- Cada picking puede tener N SKUs (tabla `control_cruce_skus`)
- UI: botón "Agregar SKU" → modal con chips + input
- Export: un picking con 3 SKUs = 3 filas en el Sheet
- **Pendiente**: Ejecutar migración `039_control_cruce_skus.sql` en Supabase Dashboard

#### Pendiente de configuración (manual, una sola vez)
1. Agregar a `.env.local`: `GOOGLE_CONTROL_CRUCE_SHEET_ID=1hzEACZM31wubNgGhFibpnUlUYo0IYDM4OCYgtPBkxGg`
2. Compartir ese spreadsheet con el `client_email` de `GOOGLE_SERVICE_ACCOUNT_JSON` (rol **Editor**).

---

### Diagnóstico completo (pendiente de resolver)
- **Multiple permissive policies** (WARN): `profiles`, `audit_active_sessions`, `calendario_central`, `config_despacho`, `shared_session_state` tienen múltiples políticas SELECT permisivas para el mismo rol — se evalúan todas en cada query. Requiere consolidar en una política por rol/acción.
- **Unindexed foreign keys**: `audit_entries.user_id`, `dispatch_history.user_id`, `picking_pallets.combined_into`, `ruta_*` tables. Agregar índices mejoraría queries que filtran por estos campos.
- **5 canales separados escuchando `picking_pallets`** (usePickingReady, StepForm, CombineAlertsPanel, TiendasPage, PickingScreen) — candidato a consolidar en un hook singleton.
