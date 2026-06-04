# CoordinaciónKiosClub — Memoria del sistema

## Qué es esta app

Plataforma operacional interna de KiosClub para gestionar el ciclo completo de despacho: ingreso en bodega → enrutamiento → entrega en tienda → auditoría → trazabilidad. Cubre 200+ tiendas en Chile. Stack: Next.js 15 (App Router) + Supabase + Google APIs + Odoo.

---

## Módulos y rutas

| Ruta | Módulo | Quién la usa |
|---|---|---|
| `/` | LaunchScreen | Todos — estadísticas + accesos directos |
| `/despacho` | Hub selector | Todos — elige Regiones o Santiago |
| `/despacho/regiones` | Bodega Nacional | Operador Bodega Regiones |
| `/despacho/santiago` | Bodega RM/Costa | Operador Bodega Santiago |
| `/despacho/santiago/rutas` | Enrutador | Coordinador de rutas |
| `/conductor-hub` | Portal conductor | Conductor (sin login, solo patente) |
| `/r/[token]` | Recepción en tienda | Conductor + receptor tienda |
| `/auditoria` | Auditoría + Trazabilidad | Auditor / Admin |
| `/historial` | Historial despachos | Todos |

---

## Flujo completo end-to-end

### 1. Bodega ingresa ítems (09:00)

**Regiones** (`AppContext` + localStorage + Supabase):
- Selecciona tienda de catálogo (200+ tiendas con cod, email, región)
- Sube PDF de guía → `processPdf()` extrae números de guía y montos automáticamente
- Agrega ítems: `{ orden, tipo, pkg (pallet|bulto), guia, valor, peso, dimensiones }`
- `AppContext.ADD_ITEM` → guarda en state → debounce 800ms → push a Supabase `shared_session_state` (fuente: "regiones")
- Otro usuario ve los cambios en tiempo real (Supabase Realtime WebSocket)

**Santiago** (`SantiagoContext` + localStorage + Supabase):
- Flujo 3 pasos: StepRegimen → StepForm → StepResumen
- Selecciona régimen: RM o COSTA
- Agrega ítems: formulario individual o multi-ítem con presets
- Estado sincronizado a `shared_session_state` (fuente: "santiago")
- No hay conflicto entre Regiones y Santiago (fuentes diferentes en Supabase)

### 2. Exporta y envía (09:20)

**Excel** (`exportUtils.ts`):
- `buildRows()` genera array de 27 columnas estandarizadas
- `exportToTemplate()` usa plantilla base64 (localStorage o `/data/template.ts` embebido como fallback)
- Descarga archivo `.xlsx` al navegador

**Google Sheets** (via `/api/sheets-write`):
- POST con `{ sheetId, sheetName, rows[][] }`
- Server autentica con Google Service Account (env var `GOOGLE_SERVICE_ACCOUNT_JSON`)
- Append a pestaña correspondiente: `DespachoRegiones`, `DespachoSantiago`, etc.
- Nunca expone credentials al browser

### 3. Enrutador calcula (09:25)

**Fuente de datos** (`InputSection`):
- `fetchSessionState('santiago')` → lee tiendas + cantidades de Supabase
- Pre-carga: `[{ c: "T002", p: 1, b: 2 }, ...]`

**Modo Calendario** (`CalendarMode`):
- Carga calendario semanal por corredor (Supabase / Sheets)
- Asigna tiendas al día activo según su corredor

**Modo Manual** (`ManualMode`):
- Parser texto libre: `"T001:2p,1b T002:1p"` → array StoreItems

**Algoritmo** (`routing.ts`):
- `asignar(tiendas, flota)` → nearest-neighbor por capacidad de pallets
- Retorna `[{ vehiculoId, patente, tiendas[], palletsTotales, bultosTotales }]`
- Vista comparativa Manual vs. Óptima con rebalanceo si hay overflow

**Salida**:
- `ResultsSection` muestra cards de rutas
- Exporta PDF + append a `HistorialRutas` en Sheets

### 4. Conductor sale (09:40)

**`/conductor-hub`** (sin autenticación, solo patente):
- GET `/api/rutas-despacho?fecha=&patente=` → retorna `RutaData` con tiendas, guías, estado
- Timeline: PENDIENTE → EN_CAMINO → ENTREGADO
- POST `/api/ruta-eventos` → actualiza estado en Supabase → supervisor ve cambio en realtime
- Links a guías en Google Drive

### 5. Entrega en tienda (10:15)

**`/r/[token]`** (QR en etiqueta de ruta):
- `RecepcionForm` se pre-carga con datos de la entrega (pallets/bultos esperados, guías)
- Conductor ingresa:
  - Receptor, RUT, pionetas
  - Fotos de estado de mercadería (hasta 3)
  - Foto sello llegada + sello salida + temperatura
  - Observaciones
  - Diferencias vs. lo esperado (detectadas automáticamente)
  - Firma digital en canvas
- Click "Solicitar OTP" → POST `/api/send-otp` → email de 6 dígitos a la tienda (válido 10 min)
- Receptor ingresa OTP → POST `/api/recepcion/verify-code` → valida
- Confirma → POST `/api/recepcion-tienda` → inserta en tabla `recepcion` + append Sheets + actualiza trazabilidad

### 6. Auditoría (14:00)

**`/auditoria`** (`AuditoriaScreen`):
- Busca operación Odoo: POST `/api/odoo` → server autentica y ejecuta JSON-RPC
- Escanea barcode con cámara (`@zxing`) o input manual
- Compara esperado vs. auditado → detecta faltantes automáticamente
- Registra corrección con foto → inserta en Supabase `audit_entries` + Sheets

### 7. Trazabilidad (17:00)

**6 puntos por pallet/unidad** (tabla `trazabilidad_unidades`):
1. Picking (en bodega)
2. Salida Bodega (conductor sale)
3. Llegada Tienda (recepción firmada)
4. Salida Tienda (si aplica)
5. Auditoría (resultado de picking audit)
6. Cierre (ruta marcada como completada)

Timeline exportable en PDF. Admin puede ver estado de cualquier pallet por ID.

---

## Sincronización y estado

### Capas de estado

```
localStorage (inmediata)
   → debounce 800ms
      → Supabase shared_session_state (realtime WebSocket)
         → otros usuarios reciben push automático
```

### Fuentes en shared_session_state

| fuente | módulo |
|---|---|
| `"regiones"` | Bodega Nacional |
| `"santiago"` | Bodega RM/Costa |
| `"calendario"` | Calendario de tiendas activas del día |
| `"rutas"` | Estado del enrutador |

### Offline queue

Si no hay conexión, datos van a `OFFLINE_QUEUE_KEY` en localStorage. Al reconectar, flush automático a Supabase.

---

## Contextos globales

### `AppContext` (`/context/AppContext.tsx`)

Estado global de Bodega Regiones. Acciones principales:
- `SET_TIENDA(cod)` — selecciona tienda activa
- `ADD_ITEM(item)` — agrega ítem al dispatch de la tienda activa
- `REMOVE_ITEM(tienda, id)` — elimina ítem
- `CLEAR_ALL` — limpia todo el estado del día
- `PUSH_TO_SUPABASE` — sync manual forzado

### `SantiagoContext` (`/features/despacho/santiago/context/`)

Estado de Bodega Santiago. Patrón reducer. Acciones:
- `SET_REGIMEN(rm|costa)`
- `ADD_ITEM(item)`
- `EDIT_ITEM(id, partial)`
- `REMOVE_ITEM(id)`
- `SET_STEP(1|2|3)`
- `SYNC_FROM_SUPABASE(data)`

---

## API Routes (server-side)

| Ruta | Función |
|---|---|
| `POST /api/odoo` | Proxy Odoo JSON-RPC. Autentica server-side. Acciones: `search_operations`, `test_connection` |
| `POST /api/sheets-write` | Append filas a Google Sheets. Body: `{ sheetId, sheetName, rows }` |
| `POST /api/drive-upload` | Sube archivo a Google Drive. Retorna fileId + links |
| `POST /api/send-otp` | Genera OTP 6 dígitos, envía por email vía Nodemailer. TTL 10 min |
| `POST /api/recepcion/verify-code` | Valida OTP ingresado |
| `POST /api/recepcion-tienda` | Guarda recepción en Supabase + trigger trazabilidad |
| `POST /api/ruta-eventos` | Actualiza estado de ruta (conductor) |
| `GET /api/rutas-despacho` | Carga ruta del día por patente |
| `POST /api/trazabilidad` | Actualiza punto del timeline de un pallet |

---

## Base de datos Supabase

### Tablas principales

| Tabla | Uso |
|---|---|
| `stores` | Catálogo de tiendas (RLS activo) |
| `recepcion` | Recepciones firmadas en tienda |
| `guides` | Guías de despacho |
| `picking_pallets` | Slots de pallet de picking |
| `trazabilidad_unidades` | Timeline 6 puntos por unidad |
| `conteo_consolidacion` | Conteos diarios de consolidación |
| `shared_session_state` | Estado compartido realtime (por fuente) |
| `user_session_state` | Estado per-usuario |
| `audit_entries` | Registros de auditoría picking |

### Realtime

Tablas con Realtime habilitado: `shared_session_state`, `user_session_state`, `recepcion`, `trazabilidad_unidades`, `audit_entries`.

---

## Tipos TypeScript principales (`/types.ts`)

```typescript
DispatchItem    // ítem Regiones: orden, tipo, pkg, guia, valor, peso, dimensiones
SantiagoItem    // ítem Santiago: tipo, contenido, dim, peso volumétrico, estado
TiendaSantiago  // tienda RM: cod, dir, ventanas horarias, días despacho
HistoryEntry    // snapshot día: fecha, tiendas, ítems, totales
StoreItem       // para enrutador: { c: cod, p: pallets, b: bultos }
Vehiculo        // flota: patente, conductor, capPallets, capBultos
RutaData        // ruta asignada: id, código, conductor, patente, tiendas[], guías[], estado
```

---

## Catálogos de datos

- `/features/despacho/regiones/data/tiendas.ts` — 200+ tiendas con cod, nombre, email, teléfono, RUT empresa, región, comuna, dirección
- `/features/despacho/santiago/data/tiendasSantiago.ts` — tiendas RM/Costa con ventanas horarias por día
- `/features/despacho/rutas/data/tiendas.ts` — tiendas con coordenadas GPS para mapas
- `/features/despacho/rutas/data/flota.ts` — vehículos con capacidades
- `/features/despacho/rutas/data/calendar.ts` — calendario maestro semanal por corredor

---

## Algoritmo de enrutamiento (`/features/despacho/rutas/utils/routing.ts`)

```
asignar(tiendas: StoreItem[], flota: Vehiculo[]) → Ruta[]

1. Por cada tienda (ordenada por pallets desc):
   - Busca vehículo con menor carga actual que tenga capacidad disponible
   - Asigna tienda al vehículo
2. Si overflow → rebalanceo automático (mover tiendas entre vehículos)
3. Retorna array de rutas con vehículo + tiendas asignadas
```

---

## Convenciones de código

- Componentes: PascalCase, un archivo por componente
- Context: patrón reducer con `useReducer` + `useContext`
- API routes: un archivo por endpoint en `/app/api/`
- Utils: funciones puras, sin estado
- Data: arrays/objetos estáticos exportados como const
- Sheets export: siempre 27 columnas exactas (Regiones) — no cambiar el orden
- PDF extract: `processPdf()` retorna `{ guias: [{num, total}], totalSum }`

---

## Variables de entorno requeridas

```
NEXT_PUBLIC_GOOGLE_MAPS_KEY     # Maps embed + API
NEXT_PUBLIC_SUPABASE_URL        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # Supabase anon key
GOOGLE_SERVICE_ACCOUNT_JSON     # JSON completo del service account
SMTP_HOST / SMTP_USER / SMTP_PASS  # Para OTP email
```

---

## Patrones a respetar

1. **Credenciales siempre server-side**: Odoo, Google SA, SMTP nunca en cliente
2. **RLS en Supabase**: no desactivar, toda query del cliente pasa por RLS
3. **Middleware de rutas**: `middleware.ts` protege con JWT — no bypassear
4. **Exportación Excel**: la plantilla tiene columnas fijas; `buildRows()` debe generar exactamente 27 cols en el orden correcto
5. **Fuentes Supabase**: respetar las fuentes (`"regiones"`, `"santiago"`, etc.) para no mezclar estados entre módulos
6. **Offline-first**: siempre guardar en localStorage antes de pushear a Supabase
