# Estado actual del trabajo

## Última sesión
Fecha: 2026-06-15
Rama: ux-despacho — **CERRADA y commiteada. Nueva rama: controlv3 desde main.**

## Resumen de lo que quedó en ux-despacho
**Rediseño UX enterprise dark de /despacho/regiones** — completo.

### Cambios entregados
- **Sistema de tokens CSS** (`src/index.css`): vars semánticas `--text-hi/mid/lo`, `--line`, `--line-2`, `--surface-card/header/inset/raised`, `--card-bg/active` en `:root` (light) y `.theme-dark` (dark).
- **tailwind.config.js**: aliases `surface.*`, `txt.*`, `line.*` para las vars CSS.
- **AppScreen**: clase condicional `theme-dark` desde `ThemeContext`.
- **AppHeader**: toggle Sol/Luna + tokens CSS en lugar de rgba hardcoded.
- **CombineItemsModal, FinishModal, PendingDraftBanner**: todas las rgba → `var(--...)`.
- **TabBar, StatsBar, BottomBar**: tokens CSS, light/dark adaptativos.
- **TiendasPage**: `inputCls`, `SLabel`, `Field`, `TiendaGridCard` y formularios con tokens.
- **Fix 500**: stray `}}` en TiendasPage.tsx:1465 corregido. Clave duplicada `card` en tailwind eliminada.

216/216 tests pasan.

## En progreso
**rama `controlv3`** (creada desde main) — sin cambios todavía.
Propósito por definir con el usuario en la próxima sesión.

## Backlog (sin urgencia)
1. PR de ux-despacho hacia main cuando el usuario lo apruebe.
2. Deuda diferida: refactor de componentes monolíticos
   (StepForm ~2384 líneas, AuditoriaScreen ~2400).
3. Seguridad menor (preexistente): activar Leaked Password Protection en Supabase Auth.
