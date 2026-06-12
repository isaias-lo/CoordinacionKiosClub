# Estado actual del trabajo — Erick

## 🔴 PENDIENTE AL LLEGAR — empezar por aquí (sobre todo en el MAC)
**Instalar y loguear `gh` (GitHub CLI) en el Mac**, para que Claude pueda abrir PRs desde ahí.
1. En la Terminal del Mac:  `brew install gh`  (si no tienes brew, ver https://brew.sh)
2. Loguear una vez:  `gh auth login`  → GitHub.com → HTTPS → Login with a web browser → pegar el código.
3. Verificar:  `gh auth status`
> En cecilia (PC trabajo) ya quedó `gh` instalado; solo falta que Erick haga `gh auth login` ahí también.
> Nuevos comandos disponibles: `npm run pr` (abrir PR a main) además de `npm run hola` / `npm run bye`.

---

## Última sesión
Fecha: 2026-06-12 (cierre desde cecilia / PC laboral)
Rama: `inicio` (sincronizada con `main` + remoto; nada sin subir salvo artefactos de build)
Último commit: `195586d` Merge origin/main into inicio

### Qué se hizo hoy
1. **PR #16 (Estado/Seguimiento visual) → mergeado a `main` por el compañero.** El rework visual ya está en producción.
2. **Sync de `main` a `inicio`** tras el merge: trajo el trabajo del compañero (202 tests, fixes auth/email, AppSidebar). Conflicto único en `TRABAJO.md` resuelto.
3. **PR #17 ABIERTO** (`inicio → main`, MERGEABLE, Vercel preview OK) con los 5 fixes que quedaron fuera del PR #16:
   - fix realtime entre cuentas (`shared_session_state`, filtro de 1 campo).
   - **semáforo de bodegas automático** (server-side, batch a Odoo throttleado 1/min, sin abrir Picking, sin botón).
   - fix sidebar en `/registros`.
   - fix franja gris arriba de los tabs de Estado.

### 🔵 AL LLEGAR A CASA — empezar por aquí
1. `hola` (trae `inicio` al PC de casa).
2. Revisar / mergear el **PR #17** en GitHub para que los fixes (realtime + semáforo) lleguen a producción. (Si el check `ci` sale rojo, es por los tests del compañero, no por nuestro código.)
3. Heads-up: `tsc` marca errores en `__tests__/*.test.ts` (del compañero, ya en `main`); no son nuestros.

---

## Sesión 2026-06-07 (histórico)
Último commit: feat(skills): agregar 10 skills de Antigravity + reglas de auto-activación (`1cde6b0`)
Rama: inicio

## Qué se hizo esta sesión
1. **Migración a rama `inicio`** — Se abandonó `desdecasamac` (atrasada 60 commits). Trabajando desde `inicio` que tiene todos los cambios del trabajo.
2. **Evaluación de 6 Claude Code skills/herramientas:**
   - Superpowers → ❌ No (metodología rígida, sin tests en el proyecto)
   - UI UX Pro Max → ✅ Ya estaba activo — usar con `/ui-ux-pro-max`
   - claude-mem → ❌ No (no sincroniza entre PCs, inferior a TRABAJO.md en git)
   - Antigravity Awesome Skills → ✅ Instalado (10 skills seleccionados)
   - Andrej Karpathy Skills → ❌ No (redundante, ya en Claude Code nativo)
   - Everything Claude Code → ⚠️ Pendiente evaluar con `--profile minimal`
3. **10 skills instalados en `.claude/skills/`** (en el repo, disponibles para todo el equipo):
   - `nextjs-app-router-patterns`, `nextjs-supabase-auth`
   - `odoo-rpc-api`, `odoo-performance-tuner`
   - `frontend-ui-dark-ts`, `database-design`, `database-optimizer`
   - `auth-implementation-patterns`, `api-security-best-practices`
   - `e2e-testing-patterns`
4. **Auto-activación configurada en CLAUDE.md** — los skills se activan solos según el contexto del archivo que se edite.

## Sesión anterior (2026-06-09)
5 fixes ya en `main`:
1. Bug bodegas: ítems agregados ya no vuelven a formulario al navegar.
2. Chocolates auto-agregados a 20 kg + clic agrega sin pedir peso.
3. Crear IDs desde bodega (todos los tipos), excluidos de Picking.
4. Guía 35BNT → 35BN2.
5. Eliminado "Movimientos" de Picking.

## Próximos pasos
- Probar en vivo los 5 fixes de bodegas/chocolates.
- Evaluar Everything Claude Code con `--profile minimal`.
- Si el equipo crece a 3+, revisar Superpowers (ver memoria del proyecto).

## Recordatorio
- Al llegar:  `npm run hola`
- Antes de salir:  `npm run bye`
- Detalle completo en FLUJO.md
