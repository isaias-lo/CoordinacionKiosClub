# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (also runs copy-pdf-worker first)
npm run build      # Production build (also runs copy-pdf-worker first)
npm run lint       # ESLint via next lint
npm test           # Run all unit tests (vitest run)
npm run test:watch # Watch mode — re-runs on save
```

The `copy-pdf-worker` script is wired as a `pre*` hook and copies `pdfjs-dist` worker files to `public/` — it runs automatically before `dev` and `build`.

## Testing Policy

**Whenever you create or modify a feature, write tests for it.**

### What to test
- **Pure utility functions** (`src/features/*/utils`, `src/lib/`) — always testable, no mocking needed.
- **Zod schemas** in `src/lib/schemas.ts` — test valid and invalid inputs for any schema you add or change.
- **API auth logic** (`src/lib/apiAuth.ts`) — test with real JWTs via `jose`'s `SignJWT`.
- **Offline queues / localStorage logic** — use `// @vitest-environment jsdom` at the top of the file.
- **Business logic in hooks or context** — extract pure functions and test those; skip React rendering tests.

### What NOT to test
- React component rendering (no React Testing Library in this project — keep it out).
- Supabase DB queries — mock at the `@supabase/supabase-js` import level if needed.
- Next.js routing, middleware, or build behavior.

### Where to put test files
```
src/features/<feature>/__tests__/<name>.test.ts   ← feature-specific
src/lib/__tests__/<name>.test.ts                  ← shared lib
```

### Conventions
- Use `vitest` globals (`describe`, `it`, `expect`, `vi`) — configured in `vitest.config.ts`.
- Path alias `@/` works in tests exactly as in source.
- To prevent network calls in tests that fall back to Supabase auth, mock `@supabase/supabase-js`:
  ```ts
  vi.mock('@supabase/supabase-js', () => ({
    createClient: vi.fn(() => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
  }));
  ```
- For modules that read `process.env` at init time (like `apiAuth.ts`), use `vi.stubEnv` + `vi.resetModules()` before dynamic import.
- Run `npm test` after writing tests. All tests must pass before committing.

## Architecture Overview

Next.js 15 App Router app. All pages live in `src/app/`, all domain logic in `src/features/`, shared utilities in `src/lib/`.

### Feature Areas

- **`features/despacho/`** — Dispatch operations, split into sub-domains:
  - `santiago/` — Dispatch for the Santiago metro area (multi-step wizard with context in `SantiagoContext`)
  - `regiones/` — Dispatch for regions (tabbed view with PDF export)
  - `rutas/` — Route planning with Google Maps integration and fleet management
  - `estado/` — Dispatch tracking/status (QR scanner panel)
  - `control-flota/` — Fleet control panel
- **`features/auditoria/`** — Warehouse auditing, tightly coupled with Odoo. Contains tabs (live, history, dashboard, stats, trazabilidad, admin) and a rich component tree under `components/`.
- **`features/picking/`** — Warehouse picking session management (Odoo operations grouped by picker/store).
- **`features/tiendas/`** — Store QR scanning, reception forms, barcode scanning.
- **`features/control-interno/`** — Admin-facing: `TiendasAdminContent` (full CRUD for stores + Sheets sync), `CalendarioCentral`, `CalendarioColumnas`.
- **`features/recepcion-tienda/`** — Store reception control flow.
- **`features/panel-operaciones/`** — Operations panel.

### Data Layer

**Two Supabase clients — use the right one:**
- `src/lib/supabase.ts` — browser singleton (`createBrowserClient`), for client components.
- `src/lib/supabaseServer.ts` — server client (`createClient` with service role key), for API routes only. Each call creates a new instance.

**Real-time:** Supabase `postgres_changes` is used in `calendarioSync.ts` and `userSessionState.ts` for cross-device/cross-tab sync. Always return an unsubscribe function and call it on cleanup.

**Odoo:** All Odoo calls go through `/api/odoo` (a server-side JSON-RPC proxy). Client code in `features/auditoria/utils/odooApi.ts` calls this proxy — it never talks to Odoo directly. The proxy authenticates on every request (stateless) and has a 15 s timeout.

**Google Sheets:** Three API routes handle Sheets sync for tiendas: `POST /api/tiendas` (fire-and-forget write-back after save), `POST /api/tiendas/sync` (Sheets → Supabase), `POST /api/tiendas/export-sheets` (Supabase → Sheets). All use `GOOGLE_SERVICE_ACCOUNT_JSON`. **Critical:** this env var may contain full-width Unicode characters — always sanitize with `/[！-～]/g` (range `！-～`) before `JSON.parse`, not just digits `/[０-９]/g`.

### Authentication & Roles

`AuthProvider` (`src/components/AuthProvider.tsx`) provides `useAuth()`. Roles and permissions are read directly from Supabase JWT `user_metadata` — no DB round-trip. Roles: `admin`, `despachador`, `auditor`, `admin-auditoria`, `recepcion-tienda`, `supervisor-picking`, `asistente-despacho`, `coordinador-flota`, `supervisor`. `admin` bypasses all permission checks. Use `can(section, 'edit' | 'read')` for gate-checking.

**OTP flow:** `send-otp` → `verify-otp` routes. Tokens are HMAC-SHA256 signed (10 min TTL) via `src/lib/otpToken.ts`. Secret in `OTP_SECRET` env var.

### Store Code Normalization

Store codes must match `/^[0-9]{0,2}[A-Z]{2,5}[0-9]?$/`. Use `norm()` from `features/despacho/rutas/utils/helpers.ts` to normalize raw codes: strips accents, converts Ñ→N, uppercases, and resolves aliases via `ALIAS` map. This same logic is replicated in sync routes — keep them in sync.

### Key Patterns

- **Fire-and-forget syncs** use `.catch(e => console.error(...))` — they must not block the HTTP response. Only throw from syncs called from `await`.
- **`shared_session_state`** table (keyed by `fecha,fuente`) stores daily shared UI state across users for `regiones`, `santiago`, `guides`, and `rutas` views.
- **Calendar** is stored as a single JSON blob in `calendario_central` (row id = `'current'`), synced real-time. In-memory module-level cache (`useCalendario.ts`) has a 60 s TTL; localStorage cache has 1 h TTL.
- **Inline styles** dominate the admin/internal UIs (no Tailwind). Tailwind is used in the public-facing dispatch UI.

## Environment Variables

Required in `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`
- `NEXT_PUBLIC_ODOO_URL`, `NEXT_PUBLIC_ODOO_DB`, `NEXT_PUBLIC_ODOO_USERNAME`, `NEXT_PUBLIC_ODOO_API_KEY`
- `OTP_SECRET`, `GMAIL_USER`, `GMAIL_APP_PASS`

## Modelo y flujo de trabajo (ahorro de tokens)
Por defecto este proyecto corre en **Sonnet** (ejecutor, ver `.claude/settings.json`). El objetivo es
gastar Opus/Fable solo donde aportan y dejar la ejecución en Sonnet.

- **Tarea simple** (ajuste de UI, fix puntual, un archivo — el ~80% de los commits): Sonnet hace todo. NO
  invoques subagentes ni Opus; sería gasto inútil.
- **Tarea difícil / multi-paso / de arquitectura**: planifícala con un subagente **Plan** en Opus o Fable
  (`Agent` con `subagent_type: Plan`, `model: opus` o `fable`). El subagente devuelve el plan; Sonnet lo
  ejecuta.
- **Al terminar una tarea importante**: corre el testeo/revisión final con Opus o Fable (subagente de
  review o `/code-review`), no con Sonnet.
- Para cambiar el modelo puntualmente en una sesión usa `/model`.

## Instrucción de sesión
Al iniciar cada sesión, lee TRABAJO.md y resume brevemente en qué estamos.
Al terminar cualquier tarea importante, actualiza TRABAJO.md con el estado actual sin que te lo pida.

### Comandos "nueva tarea" / "hola" / "bye" / "PR" / "sync" (continuidad entre PCs trabajo↔casa)
El usuario trabaja desde dos equipos (trabajo y casa). **Una RAMA NUEVA por tarea desde `main`** — NO se
reusa una rama vieja (queda atrás de main y se ensucia con auto-commits WIP). Guía completa en FLUJO.md.
- **"nueva tarea"** (al empezar algo nuevo): crea rama desde main actualizado — `npm run nueva-tarea
  <fix|feat|chore>/<nombre>` (`git fetch` + `git checkout -b <rama> origin/main`). No empieces trabajo nuevo
  sobre una rama ya mergeada.
- **"hola"** (al iniciar): ponlo al día — `npm run hola` (`git fetch` + `git pull --ff-only` de su rama
  actual). Avísale si hay cambios locales sin commitear. **Si la rama actual ya se mergeó a main y no hay
  trabajo en curso, sugiérele `nueva-tarea`** (o resetear a main) en vez de seguir sobre una rama vieja.
- **"bye"** (o "me voy"/"adiós"): cierre de jornada — actualiza TRABAJO.md y TRABAJO_<persona>.md, `git add
  -A` + commit (WIP si aplica) y `git push` de su rama. **Nunca abras PR ni subas a `main` con bye.**
- **"PR"** / **"subir PR"**: abre el PR de su rama → `main` (push + `gh pr create --base main --fill`). Acción
  DELIBERADA, solo cuando está listo para producción. **No mergees solo.** Tras mergear en GitHub esa rama
  queda obsoleta → para lo siguiente, `nueva-tarea`.
- **"sync"**: trae lo último de `main` a su rama (`git fetch` + `git merge origin/main`) y push. Úsalo en
  tareas largas si main avanzó.
- Atajos: `npm run nueva-tarea <rama>`, `npm run hola`, `npm run bye`, `npm run sync`, `npm run pr`.

### Flujo de ramas / deploy
**Una rama por tarea desde `main`** → PR (`gh pr create --base main`) → el usuario revisa/mergea en GitHub →
la rama se borra. **NO** mergear directo a main; **NO** reusar una rama ya mergeada para una tarea nueva
(causa divergencia y commits WIP basura, y obliga a resetear cada sesión). Vercel solo despliega `main`.

## Skills — activación automática por contexto

Los siguientes skills están en `.claude/skills/` y deben aplicarse automáticamente según el contexto de la tarea, sin necesidad de invocarlos explícitamente:

| Contexto detectado | Skill a aplicar |
|---|---|
| Trabajar en `src/app/` (rutas, layouts, page.tsx, route.ts) | `@nextjs-app-router-patterns` |
| Trabajar con Supabase auth, sesiones, roles o middleware | `@nextjs-supabase-auth` |
| Trabajar en `src/app/api/odoo/` o `odooApi.ts` | `@odoo-rpc-api` |
| Optimizar queries lentos a Odoo o reducir timeouts | `@odoo-performance-tuner` |
| Crear o modificar componentes UI / pantallas / cards | `@frontend-ui-dark-ts` |
| Diseñar o modificar tablas de Supabase / migraciones | `@database-design` |
| Trabajar con OTP, JWT, roles o permisos | `@auth-implementation-patterns` |
| Crear o modificar API routes en `src/app/api/` | `@api-security-best-practices` |
| Escribir tests (cuando se agreguen al proyecto) | `@e2e-testing-patterns` |
| Diagnosticar queries lentos en Supabase | `@database-optimizer` |
