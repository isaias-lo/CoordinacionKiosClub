# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (also runs copy-pdf-worker first)
npm run build      # Production build (also runs copy-pdf-worker first)
npm run lint       # ESLint via next lint
```

There are no tests in this project. The `copy-pdf-worker` script is wired as a `pre*` hook and copies `pdfjs-dist` worker files to `public/` — it runs automatically before `dev` and `build`.

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

## Instrucción de sesión
Al iniciar cada sesión, lee TRABAJO.md y resume brevemente en qué estamos.
Al terminar cualquier tarea importante, actualiza TRABAJO.md con el estado actual sin que te lo pida.

### Comandos "hola" / "bye" (continuidad entre PCs trabajo↔casa)
El usuario trabaja desde dos equipos (trabajo y casa) sobre la MISMA rama. La guía completa está en FLUJO.md.
- Cuando el usuario diga **"hola"** (o al iniciar): asegúrate de que esté al día — equivale a `npm run hola` (`git fetch` + `git pull --ff-only` de su rama). Avísale si hay cambios locales sin commitear.
- Cuando el usuario diga **"bye"** (o "me voy"/"adiós"): ejecuta el cierre de jornada — actualiza TRABAJO.md y TRABAJO_<persona>.md, haz `git add -A` + commit (WIP si aplica) y `git push` de su rama. Nunca subas WIP directo a `main`.
- También existen los atajos `npm run hola` y `npm run bye` (scripts en `scripts/`).

### Flujo de ramas / deploy (vigente desde 2026-06-09)
Trabajar en rama del día y **NO mergear directo a main**: abrir PR con `gh pr create` para que el usuario lo revise/mergee desde GitHub. Vercel solo despliega `main`.
