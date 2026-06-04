# CoordinaciónKiosClub

**Plataforma operacional end-to-end para la gestión de despacho de KiosClub**

Sistema interno que cubre todo el ciclo de vida de un despacho: desde que se ingresa un ítem en bodega hasta que el conductor entrega en tienda y el auditor verifica contra el ERP. Diseñado para equipos de bodega, conductores y auditores trabajando en simultáneo.

---

## ¿Qué problema resuelve?

KiosClub opera despachos diarios hacia **200+ tiendas** en Chile (Regiones y RM). Antes de este sistema, la coordinación se hacía manualmente: planillas separadas, WhatsApp, y sin trazabilidad real del estado de cada entrega.

Esta plataforma centraliza:

- **Ingreso de ítems** en bodega (con lectura automática de guías PDF)
- **Asignación óptima de rutas** a vehículos de la flota
- **Recepción firmada en tienda** con OTP de verificación
- **Auditoría de picking** integrada con Odoo
- **Trazabilidad de 6 puntos** desde picking hasta cierre de ruta
- **Sincronización en tiempo real** entre múltiples usuarios/bodegas

---

## Módulos

### Despacho Regiones `/despacho/regiones`

Bodega Nacional gestiona envíos a tiendas fuera de la RM.

- Selección de tienda con datos de empresa, email y región precargados (200+ tiendas)
- Carga de PDF de guía → extracción automática de números de orden y montos
- Formulario por ítem: tipo de contenido, packaging, dimensiones, peso, valor
- Estadísticas en tiempo real: pallets totales, bultos, peso, monto
- Exportación a **Excel con plantilla** (27 columnas estandarizadas)
- Envío a **Google Sheets** `DespachoRegiones`
- Sincronización realtime entre operadores vía Supabase

### Despacho Santiago `/despacho/santiago`

Bodega RM gestiona envíos dentro de la Región Metropolitana y Costa.

- Flujo en 3 pasos: Régimen (RM/Costa) → Formulario de ítems → Resumen
- Formulario individual y multi-ítem con presets de cantidades
- Calendario de tiendas activas del día (editable)
- Panel de resumen con edición inline de cualquier ítem
- Botón **Enrutar** disponible en todo momento (mobile y desktop)
- Envío a **Google Sheets** `DespachoSantiago`
- Sincronización realtime con contexto compartido (`SantiagoContext`)

### Enrutador `/despacho/santiago/rutas`

Calcula la distribución óptima de tiendas entre los vehículos disponibles.

- Pre-carga automática desde Bodega Santiago (tiendas + cantidades)
- **Modo Calendario**: asignación automática por corredor y día de la semana
- **Modo Manual**: texto libre tipo `T001:2p,1b` para asignación expresa
- Algoritmo **nearest-neighbor** por capacidad de pallets
- Vista de comparación Manual vs. Óptima con rebalanceo automático
- Paradas adicionales con geolocalización Google Maps
- Exportación a **PDF** e historial en Google Sheets
- Sincronización de datos de tiendas, flota y calendario desde Sheets

### Hub del Conductor `/conductor-hub`

Portal móvil para el conductor durante la jornada.

- Carga de ruta por patente (sin login)
- Vista de tiendas asignadas con estado y mapa
- Timeline de estados: Pendiente → En Camino → Entregado
- Actualización de estado en tiempo real (supervisor ve cambios al instante)
- Guías de despacho con links a Google Drive

### Recepción en Tienda `/r/[token]`

Formulario de recepción firmada, accesible desde QR.

- Pre-carga de datos de la entrega (pallets/bultos esperados, guías)
- Captura de fotos de estado de mercadería
- Foto de sello de llegada y salida con temperatura
- Firma digital en canvas
- Verificación de identidad del receptor con **OTP por email** (6 dígitos, válido 10 min)
- Registro de diferencias vs. lo esperado
- Guarda en Supabase + append a Google Sheets `Recepción`

### Auditoría `/auditoria`

Control de calidad de picking integrado con Odoo.

- Búsqueda de operaciones de salida en Odoo por código (ej: `PICK/0001`)
- Escaneo de barcode de producto por cámara o input manual
- Comparación esperado vs. auditado con detección automática de faltantes
- Registro de correcciones con foto de evidencia
- Proxy server-side `/api/odoo` — credenciales Odoo nunca llegan al browser
- Trazabilidad con timeline de 6 puntos por pallet/unidad
- Envío a Google Sheets `Auditoria`

### Historial `/historial`

Registro permanente de todos los despachos realizados.

- Listado por tienda con totales (pallets, bultos, peso, monto)
- Re-exportación de cualquier despacho anterior a Excel
- Vista acumulada de días operados

---

## Arquitectura del sistema

```
                          ┌─────────────────────────────────────────┐
                          │              BROWSER / APP               │
                          │                                          │
                          │  Bodega Regiones  ←──Realtime──→  Bodega RM
                          │        ↓                              ↓
                          │   AppContext                  SantiagoContext
                          │   (localStorage               (localStorage
                          │    + Supabase)                 + Supabase)
                          │        ↓                              ↓
                          │    Enrutador ──── nearest-neighbor ──→ Rutas
                          │        ↓
                          │  Conductor Hub  ←── Realtime ──  Supervisor
                          │        ↓
                          │  Recepción QR  ──── OTP email ──→  Tienda
                          │        ↓
                          │  Auditoría ────────────────────→  Dashboard
                          └─────────────────────────────────────────┘
                                    ↕               ↕
                          ┌──────────────┐  ┌──────────────────────┐
                          │   SUPABASE   │  │   NEXT.JS API ROUTES  │
                          │              │  │                        │
                          │  Auth (JWT)  │  │  /api/odoo (proxy)    │
                          │  Realtime    │  │  /api/sheets-write    │
                          │  Storage     │  │  /api/drive-upload    │
                          │  RLS         │  │  /api/send-otp        │
                          │  Migrations  │  │  /api/recepcion-tienda│
                          └──────────────┘  │  /api/ruta-eventos    │
                                            │  /api/trazabilidad    │
                                            └──────────────────────┘
                                                      ↕
                                   ┌──────────────────────────────┐
                                   │       SERVICIOS EXTERNOS      │
                                   │                               │
                                   │  Google Sheets (googleapis)   │
                                   │  Google Drive (googleapis)    │
                                   │  Google Maps (embed + API)    │
                                   │  Odoo (JSON-RPC)             │
                                   │  Nodemailer (OTP email)       │
                                   └──────────────────────────────┘
```

---

## Flujo operacional completo

```
[09:00] BODEGA INGRESA ÍTEMS
   ↓
   Sube PDF de guía → extracción automática de números/montos
   Agrega ítems (tipo, paquete, dimensiones, peso, valor)
   Estado guardado en localStorage + Supabase (realtime multi-usuario)
   ↓
[09:20] EXPORTA Y ENVÍA
   ↓
   Excel con plantilla (27 columnas) → descarga local
   Google Sheets DespachoRegiones / DespachoSantiago → append remoto
   ↓
[09:25] ENRUTADOR CALCULA
   ↓
   Pre-carga desde Bodega Santiago
   Asignación nearest-neighbor → vehículo con menor carga disponible
   Exporta PDF de ruta + historial en Sheets
   ↓
[09:40] CONDUCTOR SALE
   ↓
   Escanea QR / ingresa patente en /conductor-hub
   Carga ruta (tiendas, guías, estado inicial: PENDIENTE)
   Actualiza estado → EN_CAMINO (supervisor ve cambio al instante)
   ↓
[10:15] ENTREGA EN TIENDA
   ↓
   QR de tienda abre RecepcionForm pre-cargado
   Conductor ingresa receptor, fotos, sello, temperatura, firma
   Receptor solicita OTP → email llega a la tienda → ingresa código
   Confirma recepción → registro en Supabase + Sheets
   ↓
[14:00] AUDITORÍA
   ↓
   Auditor busca operación en Odoo (PICK/0001)
   Escanea barcode de producto → compara esperado vs. auditado
   Registra correcciones con foto → guarda en Supabase + Sheets
   ↓
[17:00] CIERRE Y TRAZABILIDAD
   ↓
   Timeline de 6 puntos por pallet:
   1. Picking → 2. Salida Bodega → 3. Llegada Tienda
   4. Salida Tienda → 5. Auditoría → 6. Cierre
   Exportable en PDF para compliance
```

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS 3 + Radix UI |
| Lenguaje | TypeScript 5 |
| Base de datos | Supabase (PostgreSQL + Realtime + Auth + Storage) |
| PDF | pdfjs-dist 5 |
| Excel | xlsx (SheetJS) |
| QR / Barcode | qrcode.react · jsqr · jsbarcode · @zxing |
| Mapas | Google Maps API + embed |
| Integración Sheets/Drive | googleapis (Service Account) |
| ERP | Odoo JSON-RPC (proxy server-side) |
| Email OTP | Nodemailer |
| Animaciones | Framer Motion |
| Charts | Recharts |
| Despliegue | Vercel |

---

## Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx                      # LaunchScreen — estadísticas + accesos
│   ├── auditoria/page.tsx            # Auditoría Odoo + trazabilidad
│   ├── historial/page.tsx            # Historial despachos
│   ├── conductor-hub/page.tsx        # Portal conductor (sin login)
│   ├── r/[token]/page.tsx            # Recepción en tienda por QR
│   ├── despacho/
│   │   ├── page.tsx                  # Hub despacho (selector módulo)
│   │   ├── regiones/page.tsx         # Bodega Nacional
│   │   └── santiago/
│   │       ├── page.tsx              # Bodega RM/Costa
│   │       └── rutas/page.tsx        # Enrutador
│   └── api/
│       ├── odoo/route.ts             # Proxy Odoo JSON-RPC
│       ├── sheets-write/route.ts     # Escritura Google Sheets
│       ├── drive-upload/route.ts     # Subida Google Drive
│       ├── send-otp/route.ts         # Generación y envío OTP
│       ├── recepcion-tienda/route.ts # Guardar recepción
│       ├── ruta-eventos/route.ts     # Eventos de ruta (conductor)
│       └── trazabilidad/route.ts     # Timeline 6 puntos
│
├── features/
│   ├── auditoria/
│   │   ├── AuditoriaScreen.tsx
│   │   ├── data/todasLasTiendas.ts
│   │   └── utils/odooApi.ts · sheetsAuditoria.ts
│   │
│   └── despacho/
│       ├── regiones/
│       │   ├── pages/TiendasPage.tsx · ResumenPage.tsx
│       │   ├── components/TabBar · StatsBar · BottomBar
│       │   ├── data/tiendas.ts           # 200+ tiendas con cod, email, región
│       │   └── utils/exportUtils · pdfUtils · sheetsRegiones
│       │
│       ├── santiago/
│       │   ├── SantiagoPage.tsx
│       │   ├── steps/StepRegimen · StepForm · StepResumen
│       │   ├── context/SantiagoContext.tsx
│       │   ├── components/PickingSlotCards · SantiagoFinishModal
│       │   ├── data/tiendasSantiago.ts   # Tiendas RM/Costa con ventanas horarias
│       │   └── utils/calendarSantiago · sheetsSantiago
│       │
│       └── rutas/
│           ├── RutasScreen.tsx
│           ├── components/
│           │   ├── InputSection · CalendarMode · ManualMode
│           │   ├── ResultsSection · RouteCard · ComparisonView
│           │   ├── ParadasAdicionales · ConfigPanel · FlotaGrid
│           │   ├── Header · MapSection · ManifiestoPanel
│           │   └── ManualDispatch
│           ├── data/tiendas · flota · calendar
│           └── utils/routing · maps · sheets · helpers
│
├── components/                       # UI global (Toast, modales, shared)
├── context/AppContext.tsx            # Estado global (regiones + toast)
├── lib/supabaseClient.ts             # Cliente Supabase
├── middleware.ts                     # Protección de rutas (JWT)
├── data/template.ts                  # Plantilla Excel embebida en base64
└── types.ts                          # DispatchItem · Tienda · HistoryEntry · etc.
```

---

## Modelos de datos principales

| Tipo | Descripción |
|---|---|
| `DispatchItem` | Ítem de despacho Regiones: orden, tipo, paquete, guía, peso, dimensiones, valor |
| `SantiagoItem` | Ítem de despacho Santiago: tipo, contenido, dimensiones, peso volumétrico, estado |
| `TiendaSantiago` | Tienda RM con código, dirección, ventanas horarias y días de despacho |
| `HistoryEntry` | Snapshot de un día de despacho para historial y re-exportación |
| `StoreItem` | Tienda para enrutador: `{ c: código, p: pallets, b: bultos }` |
| `Vehiculo` | Vehículo de flota: patente, conductor, capacidad pallets/bultos |
| `RutaData` | Ruta asignada: código, conductor, patente, tiendas, guías, estado |

---

## Instalación

```bash
npm install
```

### Variables de entorno

Crear `.env.local`:

```env
# Google Maps
NEXT_PUBLIC_GOOGLE_MAPS_KEY=tu_clave_aqui

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key

# Google Service Account (Sheets + Drive)
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}

# Odoo (opcional — se configura también desde la UI)
ODOO_URL=https://tu-odoo.com
ODOO_DB=tu_base_de_datos

# Email OTP
SMTP_HOST=smtp.example.com
SMTP_USER=user@example.com
SMTP_PASS=tu_password
```

### Base de datos

Las migraciones están en `supabase/migrations/`. Aplica con:

```bash
supabase db push
```

Tablas principales: `stores`, `recepcion`, `guides`, `picking_pallets`, `trazabilidad_unidades`, `conteo_consolidacion`, `shared_session_state`, `user_session_state`.

---

## Desarrollo

```bash
npm run dev
# http://localhost:3000
```

## Compilación

```bash
npm run build
npm start
```

---

## Sincronización realtime

La app usa dos capas de sincronización:

- **`shared_session_state`** (Supabase Realtime): estado compartido entre múltiples usuarios de la misma bodega. Clave por fuente (`"regiones"` / `"santiago"`) para evitar conflictos entre módulos.
- **`user_session_state`**: estado per-usuario para configuraciones personales.
- **localStorage**: caché local con debounce de 800ms antes de pushear a Supabase.
- **Offline queue**: si no hay conexión, los datos se acumulan en `OFFLINE_QUEUE_KEY` y se sincronizan automáticamente al reconectar.

---

## Seguridad

- **RLS en Supabase**: Row Level Security activo en todas las tablas sensibles.
- **Middleware Next.js**: redirige rutas protegidas si no hay JWT válido.
- **Proxy Odoo**: `/api/odoo` autentica contra Odoo server-side, las credenciales nunca llegan al browser.
- **Proxy Sheets/Drive**: credentials de Service Account solo en entorno server.
- **OTP email**: verificación de identidad del receptor en tienda con código de 6 dígitos, válido 10 minutos, entregado al email registrado de la tienda.
