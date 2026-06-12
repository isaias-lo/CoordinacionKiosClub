# Estado actual del trabajo — Erick

## 🔴 PENDIENTE AL LLEGAR — empezar por aquí
1. **Autenticar `gh` en esta Mac** (ya está instalado en `~/.bun/bin/gh`):
   ```
   gh auth login
   ```
   → Seleccionar: GitHub.com → HTTPS → Login with a web browser → pegar el código.
   Luego verificar: `gh auth status`

2. **Ejecutar migración `041_ruta_tiendas_nombre.sql` en Supabase Dashboard:**
   - Ir a Supabase Dashboard → SQL Editor
   - Pegar y ejecutar:
     ```sql
     ALTER TABLE ruta_tiendas
       ADD COLUMN IF NOT EXISTS nombre  text,
       ADD COLUMN IF NOT EXISTS ventana text;
     ```
   - Esto habilita que los manifiestos QR muestren nombres de tiendas (no solo códigos).

---

## Última sesión
Fecha: 2026-06-12 (desde Mac casa)
Rama: `inicio`

### Qué se hizo hoy
1. **`gh` CLI instalado** (sin Homebrew) en `~/.bun/bin/gh` (v2.94.0). Falta `gh auth login`.

2. **Scripts bash creados** (`hola.sh`, `bye.sh`, `sync.sh`, `pr.sh`) — los PowerShell no funcionaban en macOS. `package.json` actualizado para detectar OS y usar el script correcto (bash en Mac, PS1 en Windows). `npm run hola/bye/sync/pr` funcionan en ambas PCs.

3. **PDF del Enrutador corregido** — El PDF se imprimía mostrando toda la UI (sidebar, mapa, botones). Fixes:
   - `src/index.css`: corregido `@media print` que estaba malformado (el `@layer components` estaba dentro del bloque de print). Agregados: `shell-container` reset, `shell-sidebar` hide, route card `page-break-inside: avoid`, `no-print` para `#mobile-menu-btn`.
   - `AppShell.tsx`: clases `shell-container` y `shell-sidebar no-print` en el contenedor raíz. Sidebar y botón móvil ahora se ocultan al imprimir.
   - `ResultsSection.tsx`: mapa Google Maps envuelto en `no-print` → ya no se imprime el mapa roto.

4. **Página QR del Manifiesto mejorada** (`/r/[token]`):
   - `supabase/migrations/041_ruta_tiendas_nombre.sql`: agrega `nombre` y `ventana` a `ruta_tiendas`.
   - `src/app/api/rutas-despacho/route.ts`: guarda `nombre` y `ventana` al crear el manifiesto.
   - `src/app/r/[token]/page.tsx`: muestra nombre de tienda (fallback a código), ventana horaria en subtítulo, y fix de scroll horizontal (`overflow-x: hidden`).
   - **Nota:** Los manifiestos ya guardados antes del fix seguirán mostrando códigos. Solo los nuevos que se guarden después de ejecutar la migración tendrán los nombres.

5. **Investigación de "Registrar Despacho"** — El botón hace 3 cosas:
   - **GAS historial** (Google Apps Script): envío con `mode: 'no-cors'` → siempre muestra "Historial guardado" aunque falle. Verificar si la URL de GAS sigue activa.
   - **DESPACHO RM** (`/api/sheets-write`): solo **ACTUALIZA** filas existentes, NO agrega nuevas. Si el módulo Bodega/Santiago no creó filas para esa fecha+tiendas, el enrutador no escribe nada en el sheet.
   - **Supabase `historial_despacho`**: la API escribe aquí si la tabla existe. Si no existe (no hay migration), falla silenciosamente. Verificar en Supabase Dashboard → Table Editor.

---

## Pendientes anteriores
- Ejecutar migración `039_control_cruce_skus.sql` en Supabase (si no está hecha).
- Agregar `GOOGLE_CONTROL_CRUCE_SHEET_ID` a `.env.local`.
- Evaluar Everything Claude Code con `--profile minimal`.

## Recordatorio
- Al llegar:  `npm run hola`
- Antes de salir:  `npm run bye`
- Detalle completo en FLUJO.md
