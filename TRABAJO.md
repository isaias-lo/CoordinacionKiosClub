# TRABAJO — Estado actual

## Sessión: UX Enterprise Reset — Todas las fases completadas

### Commits en branch `v2` (desde `2584704`):
| Commit | Descripción |
|--------|-------------|
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

## Resumen deCambios

### Fase 1 — Eliminar Hub Despacho
- `/despacho-hub` eliminado de routes.ts (MODULE_GROUPS, HOME_OPTIONS, DESPACHO_FULL, SYSTEM_ROLE_PATHS, SYSTEM_ROLE_HOME)
- `despacho-hub/page.tsx` → redirect a `/despacho`
- 26 referencias actualizadas en: AppSidebar, CommandPalette, AppHeader, LaunchScreen, SantiagoScreen, etc.

### Fase 2 — Quitar ProfilePill
- Eliminado de 24 headers de página
- Sidebar footer ya provee acceso a cuenta y logout

### Fase 3 — Fusionar Historial + Registros
- `registros/page.tsx` ahora tiene 4 tabs: rm, regiones, recepcion, historial
- `/historial` redirige a `/registros`
- HistContent se renderiza dentro de registros
- Botones Sheets/Actualizar ocultos para tab historial

### Fase 4 — Reorganizar Sidebar
- 3 nuevos grupos: Despacho (azul), Flota (naranja), Seguimiento (ámbar)
- Picking → Abastecimiento
- GROUP_META actualizado con nuevos colores
- Role labels actualizados

### Fase 5 — Unificar Gradientes
- CSS vars: `--gradient-dark`, `--gradient-dark-h`, `--gradient-card`
- CSS vars: `--surface-1/2/3`, `--border-subtle`, `--border-medium`
- CSS var: `--sidebar-dropdown`
- 5 hardcoded gradients reemplazados

### Fase 6 — UI Components
- Button.tsx eliminado (era unused)
- Barrel export limpiado
- Utility classes: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`

---

## Build Status
- ✅ `npm run build` — Compila sin errores
- ✅ TypeScript — Sin errores de tipo
- ✅ 52 páginas generadas

## Próximos pasos posibles
- Auditar el uso de `.btn-*` classes existentes y migrar los más repetitivos
- Consolidar patrones de tabs en un componente TabBar reutilizable
- Añadir tests de regresión para las rutas
