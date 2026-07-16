# KiosClub — Plataforma de Gestión de Despacho

Plataforma web interna para gestionar el ciclo completo de despacho: desde la preparación en bodega hasta la confirmación de entrega en tienda. Integra Odoo como ERP central y extiende su operativa con visibilidad en tiempo real, generación de documentos de transporte y trazabilidad del proceso.

---

## Módulos principales

### Picking (`/picking`)
Tablero de supervisión del picking en bodega conectado a Odoo en tiempo real. Muestra las operaciones activas agrupadas por tienda y por operador, con su estado, cantidad de líneas y prioridad. Se actualiza automáticamente en segundo plano. Genera el documento de picking con código de barras que acompaña cada pallet durante el despacho.

### Despacho Regiones (`/despacho/regiones`)
Gestión del despacho hacia tiendas fuera de la Región Metropolitana. Cubre el registro de guías, la generación automática de la plantilla Sendu (etiquetas para el transportista Falabella) y el manifiesto para el conductor. También registra la patente del vehículo en carga y gestiona la confirmación de recepción fotográfica en tienda.

### Despacho Santiago (`/despacho/santiago`)
Flujo de registro de despacho para la Región Metropolitana y Costa. Maneja el calendario de tiendas del día, los ítems por tienda (pallets/bultos) y el envío de registros a Google Sheets.

### Rutas (`/despacho/rutas`)
Optimización de recorridos para el área metropolitana. Integra Google Maps para calcular rutas eficientes considerando tipo de tienda (mall, strip center), ventanas horarias de recepción y capacidad de la flota. Permite ajuste manual ante imprevistos (cortes de ruta, desvíos) y exporta las rutas a PDF.

### Control de flota (`/despacho/control-flota`)
Administración de la flota de vehículos: capacidad, patente y conductor asignado. Los conductores registran la carga escaneando el código de barras de cada pallet y asociándolo a la patente del vehículo.

### Estado de despacho (`/despacho/estado`)
Panel de trazabilidad: permite consultar el estado de cualquier despacho por código, ver qué salió, en qué vehículo y si fue confirmado en destino.

### Recepción en tienda (`/recepcion-tienda`)
Flujo de confirmación de entrega. El encargado de tienda escanea el QR del manifiesto y sube una fotografía de los pallets recibidos como evidencia de recepción conforme.

### Auditoría (`/auditoria`)
Consulta de operaciones de salida en Odoo (albaranes/transferencias) por código. Permite revisar el historial de movimientos de una tienda y enviarlo a Google Sheets para análisis.

### Panel de operaciones (`/panel-operaciones`)
Vista consolidada del estado operativo del día para el equipo de coordinación.

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS 3 |
| Lenguaje | TypeScript 5 |
| Base de datos / Auth | Supabase (PostgreSQL + Auth + Realtime) |
| ERP | Odoo — integración vía JSON-RPC (proxy server-side) |
| Mapas | Google Maps API |
| Documentos | pdfjs-dist · xlsx (SheetJS) |
| Google Sheets | Google Sheets API (service account) |
| Transporte | Sendu API (etiquetas y guías regiones) |
| Despliegue | Vercel |

---

## Autenticación y roles

El acceso está controlado por Supabase Auth con roles definidos en el JWT:

| Rol | Acceso |
|---|---|
| `admin` | Acceso total, bypassa todos los permisos |
| `despachador` | Módulos de despacho (regiones, santiago, rutas) |
| `supervisor-picking` | Módulo de picking |
| `auditor` / `admin-auditoria` | Módulo de auditoría |
| `recepcion-tienda` | Confirmación de recepción |
| `coordinador-flota` | Control de flota |
| `supervisor` | Vista consolidada |

---

## Instalación

```bash
npm install
```

Crear `.env.local` con las siguientes variables:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Odoo
NEXT_PUBLIC_ODOO_URL=
NEXT_PUBLIC_ODOO_DB=
NEXT_PUBLIC_ODOO_USERNAME=
NEXT_PUBLIC_ODOO_API_KEY=

# Google
GOOGLE_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=

# Auth OTP
OTP_SECRET=
GMAIL_USER=
GMAIL_APP_PASS=
```

## Desarrollo

```bash
npm run dev       # http://localhost:3000
npm run build     # Build de producción
npm test          # Tests unitarios (vitest)
npm run lint      # Linting
```

---

## Estructura del proyecto

```
src/
├── app/                          # Rutas Next.js (App Router)
│   ├── api/                      # API Routes (server-side)
│   │   ├── odoo/                 # Proxy JSON-RPC → Odoo
│   │   ├── tiendas/              # Sync Google Sheets ↔ Supabase
│   │   └── ...
│   └── [feature]/page.tsx        # Páginas por módulo
│
├── features/                     # Lógica de dominio por módulo
│   ├── picking/                  # Picking en bodega
│   │   ├── PickingScreen.tsx
│   │   ├── hooks/usePickingOdoo.ts
│   │   └── components/
│   ├── despacho/
│   │   ├── regiones/             # Despacho a regiones
│   │   ├── santiago/             # Despacho RM
│   │   ├── rutas/                # Optimización de rutas
│   │   ├── estado/               # Trazabilidad
│   │   └── control-flota/        # Gestión de flota
│   ├── auditoria/                # Auditoría Odoo
│   ├── tiendas/                  # Recepción QR en tienda
│   └── control-interno/          # Admin: tiendas, calendario
│
├── lib/                          # Utilidades compartidas
│   ├── supabase.ts               # Cliente browser
│   ├── supabaseServer.ts         # Cliente server (service role)
│   └── apiAuth.ts                # Validación JWT API routes
│
└── components/                   # Componentes globales
    └── AuthProvider.tsx          # Contexto de autenticación
```

---

## Integración con Odoo

Todas las llamadas a Odoo pasan por el proxy server-side `/api/odoo` — el browser nunca se comunica directamente con el ERP. El proxy autentica con credenciales de servicio, mantiene caché del UID de autenticación (24h) y de los tipos de picking (por día), y utiliza un sistema de deduplicación de requests en vuelo para evitar saturación de workers.

Para el picking, la acción `picking_batch_operations` consolida en 2 RPCs lo que antes requería N × 4 RPCs paralelos (uno por tienda seleccionada).
