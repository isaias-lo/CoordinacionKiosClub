# TRABAJO — Estado actual

---

## Sesión: Estado/Seguimiento visual + fixes bodegas/realtime — 2026-06-12

Rama `inicio` (PR #16 → main, abierto, MERGEABLE). Sincronizado con `main` (auth + modo oscuro + /perfil del compañero); conflicto único en `index.css` resuelto.

### Cambios
| Área | Cambio | Commit |
|------|--------|--------|
| Estado/Seguimiento | Rework visual estilo Picking: header oscuro a lo ancho, tabs sobre el panel derecho (sin hueco), columna redimensionable, lista estilo Picking (código en caja gris, checkbox cuadro). | `4caa4dc` |
| Realtime | `shared_session_state`: filtro de 1 sola condición (Supabase no soporta multi-filtro `fecha=eq.X,fuente=eq.Y` → contaminaba estado entre fuentes). | `0dc86d9` |
| /registros | Contenedor `absolute inset-0` consistente con el shell (sidebar visible). | `d2aaac6` |
| Bodegas — semáforo | `GET /api/picking-store-progress` calcula progreso por tienda con **1 llamada batch a Odoo, cacheada + throttleada (máx 1/min vía fila META)**. Bodegas ven estado real sin abrir Picking (re-GET 60s, automático, sin botón). Picking sin cambios. | `1a5dcef` |

### Pendiente / a verificar
- **Punto 2b** (franja gris arriba de tabs): se reestructuró esa zona; verificar en el build fresco si persiste.
- Probar en `localhost:3000`: semáforo automático en bodegas, realtime entre cuentas, sidebar en /registros.

### Causa raíz documentada (semáforo verde)
El estado verde/naranja/gris lo alimentaba sólo lo que Picking publicaba al **seleccionar** tiendas (`opsMap`). Tiendas no seleccionadas → grises aunque estuvieran listas en Odoo. Ahora se calcula server-side para todas, independiente de Picking.

---

## Sesión: Picking — Lecturas a browser client + quitar realtime estáticas — 2026-06-11

### Cambios realizados

Conversión de las 4 funciones de carga restantes a usar el browser Supabase client directamente (elimina Next.js API round-trip en cada recarga):

| Función | Antes | Después |
|---------|-------|---------|
| `loadPrintRecords` | `pickingFetch('/api/picking-prints?date=...')` + sort client-side | `supabase.from('picking_prints')...order('printed_at')` |
| `loadNameChanges` | `pickingFetch('/api/picker-name-changes?date=...')` | `supabase.from('picker_name_changes')...gte/lte` |
| `loadCanonicalNames` | `pickingFetch('/api/picker-canonical-names')` | `supabase.from('picker_canonical_names')...order('key')` |
| `loadTiendaOverrides` | `fetch('/api/tiendas')` + `useRealtimeRefresh('tiendas', ...)` | `supabase.from('tiendas').select('codigo, nombre')` sin realtime |

`tiendas` es tabla estática: eliminada su suscripción realtime (era innecesaria y sumaba un canal WebSocket por usuario).

**Commit:** `perf(picking): convertir lecturas a browser client, quitar realtime en tablas estáticas`

---

## Sesión: Picking — Patrón incremental realtime — 2026-06-11

### Cambio realizado

`picking_pallets` ya no hace queries a la DB en cada evento realtime — aplica INSERT/UPDATE/DELETE directamente al estado local.

| Archivo | Cambio |
|---------|--------|
| `src/lib/pickingPalletsChannel.ts` | Listeners reciben el payload completo; `reloadListeners` para full reload en reconexión |
| `src/features/picking/PickingScreen.tsx` | Handler incremental INSERT/UPDATE/DELETE; `addPalletSlot` POST handler con 4 casos para dedup (temp+real, solo temp, solo real, ninguno) |

**Impacto:** Con 3 supervisores y N pallets, antes: 3×N queries a Supabase. Después: 0 queries adicionales — solo el WebSocket que ya existía.

**Backward compat:** `StepForm`, `TiendasPage`, `CombineAlertsPanel` usan `subscribeToPickingPallets(load)` pasando `() => void` — TypeScript permite callbacks con menos parámetros, no requieren cambios.

---

## Sesión: Picking — Fix race condition + saturación servidor — 2026-06-11

### Bugs corregidos

| Bug | Síntoma | Fix |
|-----|---------|-----|
| Race condition `addPalletSlot` | Clicks rápidos creaban pallets duplicados porque el estado no se actualizaba hasta que el POST respondía | Update optimista: slot temporal (ID negativo) agregado a `palletSlots` ANTES del await. El contador sube inmediatamente → clicks siguientes ven el valor correcto |
| Fallo silencioso al agregar pallet | Usuario no sabía que el POST falló, seguía clickeando, llenaba cola offline | Rollback del slot temporal + `showToast` con aviso al usuario en error y network error |
| Saturación servidor | 7 canales WebSocket por usuario + cada recarga pasaba por Next.js API | (1) `loadPalletSlots` migrado a browser client directo (elimina hop API+supabaseServer) (2) canal `picking_pallets` usa singleton `subscribeToPickingPallets` (3) canales `picking_prints`+`picker_name_changes` consolidados en uno |
| Índice sin uso | `picking_pallets_state_date` nunca usado por queries activas | Migration 040: drop del índice + drop índice duplicado en `control_cruce_skus` |

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/features/picking/PickingScreen.tsx` | `addPalletSlot`: optimistic update + rollback + toast; `loadPalletSlots`: browser client directo; canal `picking_pallets`: singleton con debounce 800ms; canales prints+nameChanges: consolidados |
| `supabase/migrations/040_picking_index_cleanup.sql` | Drop `picking_pallets_state_date` + drop `idx_skus_pick_det` (duplicado) |

### Canales WebSocket antes → después

| Antes (por usuario) | Después |
|---------------------|---------|
| picking_pallets (canal propio) | picking_pallets (singleton compartido) |
| picking_prints | picking_prints + picker_name_changes (1 canal) |
| picker_name_changes | — consolidado arriba |
| picking_session_state | sin cambio |
| picker_canonical_names | sin cambio |
| tiendas | sin cambio |
| presence | sin cambio |
| **7 canales** | **5 canales** |

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

### Sesión: Picking — Rediseño Enterprise UX — 2026-06-10

#### Cambios realizados (sin modificar lógica)

| Archivo | Cambios |
|---------|---------|
| `src/index.css` | Nuevas clases `.btn-info` y `.btn-outline` |
| `src/features/picking/components/PickerGroupCard.tsx` | Colores unificados a CSS vars (`--color-info`, `--color-border`); tipografía reducida (9px→10px, 22px→20px); `font-bold`→`font-semibold` en labels; emojis→Lucide icons (`AlertTriangle`, `RotateCcw`, `Package`); spacing a grid 4px |
| `src/features/picking/components/StoreListPanel.tsx` | Emojis→Lucide (`Loader2`, `AlertTriangle`); checkbox con SVG; tipografía y spacing consistentes |
| `src/features/picking/PickingScreen.tsx` | Header bg→`var(--sidebar-bg)`; tabs con `overflow-x-auto` + `text-[11px]`; grid responsive `grid-cols-1 lg:grid-cols-3`; emojis→Lucide (`Printer`, `AlertTriangle`, `Package`); section headers 22px→18px |

#### Mejoras Enterprise
- **5 tonos de azul → 2** (`--color-info` para interactivos, `--color-secondary` para marca)
- **13 font-sizes → 7** (escala: 10, 11, 12, 13, 14, 16, 20)
- **Emojis eliminados** → componentes Lucide consistentes
- **Grid responsive** → funciona en pantallas < 900px
- **Tabs scrollables** → 7 tabs caben en pantallas pequeñas
- **Empty states** → iconos SVG en vez de caracteres Unicode

---

### Diagnóstico completo (pendiente de resolver)
- **Multiple permissive policies** (WARN): `profiles`, `audit_active_sessions`, `calendario_central`, `config_despacho`, `shared_session_state` tienen múltiples políticas SELECT permisivas para el mismo rol — se evalúan todas en cada query. Requiere consolidar en una política por rol/acción.
- **Unindexed foreign keys**: `audit_entries.user_id`, `dispatch_history.user_id`, `picking_pallets.combined_into`, `ruta_*` tables. Agregar índices mejoraría queries que filtran por estos campos.
- **5 canales separados escuchando `picking_pallets`** (usePickingReady, StepForm, CombineAlertsPanel, TiendasPage, PickingScreen) — candidato a consolidar en un hook singleton.
