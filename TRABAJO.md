# Estado actual del trabajo

## 🔴 PENDIENTE AL LLEGAR (casa/Mac) — empezar por aquí: #9 Paso 3
Retomar la **Segunda vuelta (#9)** — última de las 11 mejoras (el resto ya está en prod).
1. `npm run hola` (pull de main).
2. `npm run nueva-tarea fix/segunda-vuelta-pendientes`.
3. Dile a Claude: **"seguimos con #9, Paso 3 (pendientes/conteo)"**. La lógica pura ya está mergeada en
   `vueltaRegistro.ts`. Para la 2ª prueba, Claude inserta filas de prueba 2099 por Supabase MCP.

✅ **Limpieza de prueba HECHA (2026-06-26):** Erick borró a mano las filas con fecha **31/12/2099** en
las HOJAS de Google (CONTROL DESPACHO / DESPACHO RM / DESPACHO REGIONES). Supabase y Sheets ya quedaron
limpios de la prueba del Paso 2.

---

## #9 — Segunda vuelta (estado)
PRs del lote (TODOS MERGEADOS): #73–#85 (mejoras #1–#8, #10, #11 + ajustes Cal/Manual), #86 (#9 Paso 1
lógica pura), #87 (#9 Paso 2). Migraciones aplicadas en prod: **057** (flota.en_servicio),
**058** (despacho_sesion.chocolates). (Antes: 050 picking_eventos, 051 guias_subidas.)

- **Paso 1 (#86):** lógica pura `src/features/despacho/rutas/utils/vueltaRegistro.ts`
  (`splitRoutingPorTabla`, `buildControlRows`) + tests. ✅
- **Paso 2 (#87):** el registro del Enrutador separa RM→`despacho_rm` / Regiones→`despacho_regiones`
  y CONTROL DESPACHO incluye las pendientes. ✅ **VERIFICADO EN VIVO** (fecha de prueba 31/12/2099):
  `despacho_regiones.75PUC` recibió patente (antes era imposible — siempre vacío). Filas 2099 ya
  borradas de Supabase **y de las HOJAS** (limpieza hecha 2026-06-26).

### #9 — próximos pasos (retomar aquí)
1. **Paso 3 — verificar pendientes (conteo 25→30):** 2ª prueba con fecha 31/12/2099 dejando 1 tienda
   SIN asignar. Verificar (a) la pendiente se guarda en `shared_session_state('segunda_vuelta')`
   [revisable en Supabase por Claude] y (b) aparece en CONTROL DESPACHO con patente vacía. Cómo: Claude
   inserta filas de prueba 2099 (RM+Regiones) por Supabase MCP → en Enrutador fecha 31/12/2099, modo
   Manual con 3 tiendas, dejar 1 fuera, Calcular Rutas → botón
   **"📊 REGISTRAR DESPACHO Y GENERAR MANIFIESTOS"** (este es el que guarda) → verificar → limpiar.
2. **Paso 4 — idempotencia del write de bodega:** el path `sheets-write` de bodega (DESPACHO RM/REGIONES)
   hace `append` → debe ser **upsert** por fecha+cod. Cierra también el "Reabrir → re-registrar" del #8
   (que hoy duplica filas en la hoja).
3. **Autocarga de pendientes al día siguiente:** `pendientesV2` se guarda/lee por la `fecha` del
   Enrutador; si al día siguiente la vista queda en otra fecha, no calzan. Mostrar aviso/cargar igual.

### Deuda detectada durante #9 (opcional)
- `despacho-records` PATCH compara fecha `YYYY-MM-DD` pero las tablas guardan `DD/MM/YYYY` → ese PATCH
  NO actualiza las tablas (el rellenado real ocurre vía la sync de la hoja, que sí funciona). Convertir
  la fecha en el PATCH para que sea directo/redundante.
- El Enrutador NO limpia `calT` al cambiar la fecha (sigue mostrando lo de hoy) → debería recargar al
  cambiar de día. (Estorba las pruebas: hay que borrar el textarea Manual a mano.)

---

## Infra (hecho 2026-06-24/26, desde Windows)
- ✅ **MCP de Supabase operativo en ambos equipos** (Windows: token con `setx` + reinicio de VSCode,
  verificado con SELECT real). Claude puede correr SQL/diagnósticos directo.
- ✅ **Hook PreCompact**: en ambos equipos hace un **stash de respaldo** (no `commit WIP`, no ensucia la
  rama). Windows aplicado 2026-06-26 en `~/.claude/settings.json` (`shell: bash`, usa `git stash create`+`store`).
- ✅ **Viña `37VIÑ`** verificado limpio en BD (0 rastros de `37VIN`).

## Otros pendientes (revisar vigencia — venían del TRABAJO.md anterior)
- **Egress Supabase:** rama `fix/egress-realtime-polls` (polls condicionales a Realtime, debounce 2.5s,
  badge pending 5min). Confirmar si ya se mergeó o sigue pendiente de PR (la org pasó cuota Free, gracia
  hasta 14-jul-2026).
- **Semáforo con estados raros:** 24SPP marca verde "Realizado" sin asignación; 38SP2 sale gris estando
  terminada. Diagnosticar con el SELECT de `picking_session_state('odoo-progress')` por fecha.
- **UI Actividad de Picking:** los (+)/(−) de eventos de pallet se ven muy chicos en `ActivityTab.tsx`.

[actualizar manualmente o con comando bye]
