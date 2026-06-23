# Estado actual del trabajo — Erick

## 🔴 PENDIENTE AL LLEGAR — empezar por aquí
1. **[MCP Supabase — VERIFICAR EN WINDOWS] ⚠ PRIMERO ESTO.**
   👉 Al decir "hola", Claude debe **preguntar/confirmar si estoy en el PC Windows**. Solo en Windows
   se hace esta verificación.
   - Contexto: el `.mcp.json` YA quedó **commiteado** con `npx` + **read+write** + fijado a toolskios
     (`--project-ref=aiclobncdhxjxdlvkezk`). En la **Mac** está **verificado** (lee y escribe OK).
   - **Falta probarlo en Windows.** Pasos: (a) `setx SUPABASE_ACCESS_TOKEN "TU_TOKEN"` (mismo token sbp_…);
     (b) reiniciar VSCode; (c) Claude verifica con un SELECT/escritura de prueba contra toolskios.
   - **Si en Windows el `npx` directo NO arranca** → cambiar SOLO en ese equipo el `command` del `.mcp.json`
     a `cmd` con args `["/c","npx",...]` (wrapper de Windows), sin tocar el resto. (No commitear ese ajuste
     o buscar una forma que sirva a ambos.)
2. **[Hook PreCompact — APLICAR EN WINDOWS] (solo cuando esté en el PC Windows).**
   En la **Mac** ya cambié el hook `PreCompact` de `~/.claude/settings.json` para que en vez de
   `git add -A && git commit WIP` haga un **stash de respaldo** (no ensucia la rama). Ese archivo es
   **global por equipo** (no está en el repo), así que en Windows hay que aplicar el MISMO cambio a su
   `~/.claude/settings.json`. Pídele a Claude que lo haga.
3. (Opcional) Click-through real de las 3 mejoras del PR #36 (ya en prod): instalar Playwright MCP
   (`claude mcp add playwright -- npx -y @playwright/mcp@latest`) y probar en localhost.

---

## Última sesión
Fecha: 2026-06-22/23 (Mac/casa) — semáforo en prod + **nuevo flujo de ramas por tarea**.
Rama: ahora **una rama por tarea desde main** (se dejó de reusar `inicio`).

### Qué se hizo (2026-06-22/23)
- **Semáforo de bodegas** (barra de progreso con contador, rojo/naranja/verde) → **PR #57 MERGEADO a prod**.
- **Nuevo flujo de trabajo (PR #69 MERGEADO):** se dejó de reusar `inicio` (causaba divergencia + commits
  WIP basura cada sesión). Ahora: `npm run nueva-tarea <fix|feat|chore>/<nombre>` crea una rama fresca
  desde main → trabajar → `PR` → mergear → borrar. Documentado en **CLAUDE.md** y **FLUJO.md**.
- **Hook PreCompact** (auto-commit WIP) cambiado en la **Mac** a stash de respaldo (ver pendiente #2 para Windows).
- `inicio` quedó reseteada = main (limpia).

### Sesión 2026-06-21 (PR #36 ya mergeado a prod)
- **#1 Guías de Despacho SII en el manifiesto del fiscalizador**: match robusto
  (norm + ventana fecha local Chile) en `/api/ruta-guias`; tabla `guias_subidas`
  (mig. 051) para guías subidas en bodega antes del manifiesto (el Enrutador las jala
  al crearlo); Santiago/Regiones ahora suben el PDF al bucket y lo registran;
  EstadoPage avisa si no hay manifiesto. Bucket `guides` es público (descarga OK).
- **#2 Auditoría Picking**: tabla `picking_eventos` (mig. 050) + logging crear/eliminar
  con `actor_name`; `detectarReincidencia()` cuenta "creó y borró" por supervisor;
  ActivityTab muestra eventos +/- y banner de reincidencia.
- **#3 2ª vuelta**: modelo fecha = día de SALIDA; se escribe `despacho_rm.fecha_armado`;
  InputSection con atajos Hoy/Mañana; pill de pendientes muestra la fecha de salida.
- Verificado: build OK, 247 tests, tsc/lint limpios; flujos validados a nivel de BD
  contra producción (FKs, RLS, bucket público). Migraciones 050/051 aplicadas.
- `gh` autenticado y funcionando (PR #36 creado desde aquí).

### Sesión anterior 2026-06-16 (mañana — PC trabajo)
Rama: `inicio` (sincronizada con main = 80523e6 = producción)

### Qué se hizo hoy (todo en producción)
- **Punto 4 del reporte de 5 puntos: Cierre de jornada** (PR #35, mergeado a main).
  - Pantalla "🏁 Cierre de jornada" en el Enrutador: resumen 1ª/2ª vuelta, pendientes
    (reusa `shared_session_state('segunda_vuelta')`), guía de carga extra, botón "Listo por hoy"
    (marca cross-device fuente `cierre`).
  - **Integridad 2ª vuelta**: al registrar carga extra ya no se pisan las filas despachadas en 1ª
    vuelta (`vueltaIntegrity.ts` + tests; usado en `api/despacho-records`, protege despacho_rm y picking_pallets).
  - **Decisión**: NO migrar `vuelta` a per-pallet (es write-only, el Enrutador rutea por tienda;
    HISTORIAL + CONTROL DESPACHO ya separan vueltas).
  - Limpieza: migración 048 duplicada → 049 (picking_slot_id ya aplicada vía MCP).
- **Reporte de 5 puntos CERRADO**: 1 (scroll QR), 2 (chips), 3 (#488 en AD), 5 (Enrutador móvil)
  ya estaban en main (PRs #31/#32/#33); 4 mergeado hoy.
- 231/231 tests · tsc OK · build OK.
- **Para retomar en casa**: `npm run hola` (pull de `inicio`). Nada a medias; rama al día con main.

### Sesión 2026-06-14 (histórico)
- **Code review (211 issues) COMPLETO y mergeado** (PRs #19–#22): auth en endpoints
  (cookie+Bearer), rate limit OTP, fix can()/otpToken/Unicode/Gmail, XSS pdfExport,
  setTimeout/blob leaks, error.tsx + loading, calcAuditado centralizado, clamp trazabilidad.
- **feat Registrar Despacho → Manifiestos** (PR #20) + botón "Generar Manifiestos"
  como acción secundaria.
- **fix sidebar Safari** en /registros (PR #21): `absolute inset-0` → `h-full w-full`.
- **fix tienda duplicada 23PEN/23PEÑ** (PR #22 ALIAS) + **limpieza de datos en Supabase**
  (migrado despacho_rm 23PEN→23PEÑ, eliminada fila duplicada; 0 restantes, tiendas 55→54).
- **RLS** en calendario_armado/notificaciones (PR #23, migración 046): solo authenticated,
  aplicada y verificada (anon=0, authenticated=ve filas).
- **Prompt de workflow** actualizado (núcleo + adaptación por stack) — entregado en chat.
- Nota: el MCP de Vercel conectado apunta a otra cuenta (fynanz/controlfynanz), NO a KiosClub.
  El deploy de KiosClub se verificó manualmente en el dashboard de Isaías (e82c26b, Ready).

### Histórico (sesiones previas)
1. **`gh` CLI instalado** en `~/.bun/bin/gh` (v2.94.0) y autenticado (PRs #19–#23 abiertos OK).

2. **Scripts bash creados** (`hola.sh`, `bye.sh`, `sync.sh`, `pr.sh`) — los PowerShell no funcionaban en macOS. `package.json` actualizado para detectar OS y usar el script correcto (bash en Mac, PS1 en Windows). `npm run hola/bye/sync/pr` funcionan en ambas PCs.

3. **PDF del Enrutador corregido** — El PDF se imprimía mostrando toda la UI (sidebar, mapa, botones). Fixes:
   - `src/index.css`: corregido `@media print` que estaba malformado.
   - `AppShell.tsx`: `shell-container` y `shell-sidebar no-print`. Sidebar y botón móvil ocultos al imprimir.
   - `ResultsSection.tsx`: mapa Google Maps envuelto en `no-print`.

4. **Página QR del Manifiesto mejorada** (`/r/[token]`):
   - `supabase/migrations/041_ruta_tiendas_nombre.sql`: agrega `nombre` y `ventana` a `ruta_tiendas`.
   - `src/app/api/rutas-despacho/route.ts`: guarda `nombre` y `ventana` al crear el manifiesto.
   - `src/app/r/[token]/page.tsx`: muestra nombre de tienda, ventana horaria, fix scroll horizontal.

5. **HISTORIAL Google Sheets corregido** — El GAS Web App URL dejó de funcionar después del 5/05/2026 (deployment expirado o revocado).
   - `src/app/api/sheets-write/route.ts`: agregado `'HISTORIAL'` a `ALLOWED_SHEETS`.
   - `src/features/despacho/rutas/RutasScreen.tsx`: se eliminó la llamada a `guardarHistorialFn` (GAS) y se reemplazó con llamada directa a `/api/sheets-write` con `sheet: 'HISTORIAL'`.
   - **Formato de filas HISTORIAL** (una fila por ruta): `[fecha DD/MM/YYYY, fecha legible, supervisor, patente, conductor, vuelta (1/2), n_tiendas, pallets, bultos, km_ruta, tiendas_lista, ruta_num]`
   - El historial en Supabase (`historial_despacho`) ya funcionaba — tiene 10 registros desde 2026-06-02.

6. **Investigación de "Registrar Despacho"** — El botón hace 3 cosas:
   - **Supabase `historial_despacho`** (PRIMARY): guarda resumen del día con totales. ✓ Funciona.
   - **DESPACHO RM** (`/api/sheets-write`): solo **ACTUALIZA** filas existentes. Bodega Santiago/Regiones debe crear las filas primero.
   - **HISTORIAL** (`/api/sheets-write`): ✓ Ahora funciona vía Sheets API directa (ya no depende de GAS).

---

## Pendientes anteriores
- Ejecutar migración `039_control_cruce_skus.sql` en Supabase (si no está hecha).
- Agregar `GOOGLE_CONTROL_CRUCE_SHEET_ID` a `.env.local`.
- Evaluar Everything Claude Code con `--profile minimal`.

## Recordatorio
- Al llegar:  `npm run hola`
- Antes de salir:  `npm run bye`
- Detalle completo en FLUJO.md
