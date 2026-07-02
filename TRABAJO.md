# Estado actual del trabajo

## Última sesión
Fecha: 2026-07-01
En curso: línea **enterprise visual** (mejoras solo estéticas, un PR pequeño por cambio).

## Hecho
- **PR #111 (MERGEADO a main):** PR 1 de la línea visual — capa de primitivas enterprise.
  - `index.css` + `tailwind.config.js`: tokens shadcn (primary/secondary/destructive/accent/muted/
    popover/background/foreground/input/ring) cableados a la paleta KiosClub, dark-mode aware.
  - Primitivas nuevas: `ui/card.tsx`, `ui/toolbar.tsx`, `ui/icon-button.tsx`.
  - `ui/status-badge.tsx` + `ui/empty-state.tsx` tokenizados (misma API).
  - Piloto: `app/perfil/page.tsx` adopta el Card compartido + emojis→lucide.
- **Rama actual `chore/config-modelo-flujo`:** config de modelo/flujo (default Sonnet ejecutor,
  Opus/Fable solo para planificar/revisar) — CLAUDE.md + `.claude/settings*.json`.

## Próximos pasos (línea visual enterprise — un PR por ítem, desde main actualizado)
1. **PR 2 — `style/app-shell-enterprise`:** AppSidebar, AppShell, PageHeader, HubPage
   (elevación/densidad sobria, estado activo claro, menú móvil consistente).
2. PR 3 — login/auth. PR 4 — Panel Operaciones. PR 5 — recepción/conductor móvil.
   PR 6 — auditoría. PR 7 — control interno. PR 8 — enrutador polish.

## Guardarraíles (línea visual)
- Solo estético; no tocar `src/features/picking/`, ni lógica de datos/APIs/Odoo/Supabase.
- No tocar archivos calientes recién mergeados (InputSection, ManualDispatch, CalManualSheet,
  StepForm, TiendasPage, PickerGroupCard) hasta que no haya trabajo paralelo.
- Un PR por cambio visual, desde `origin/main` actualizado; no mergear solo.

## Nota
Stash `wip-bodega-trabajo-settings` guarda notas de la rama `feat/bodega-layout-hoy-chips`.
