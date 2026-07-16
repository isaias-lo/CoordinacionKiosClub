# KiosClub — Plataforma de Gestión de Despacho

Plataforma web interna que cubre el ciclo completo de despacho de KiosClub: desde la preparación de pedidos en bodega hasta la confirmación de entrega en tienda. Está integrada con Odoo (ERP) y Google Sheets, y es utilizada por los equipos de bodega, despacho, conductores y encargados de tienda.

---

## Módulos

### Picking (`/picking`)
Tablero en tiempo real para supervisores de bodega. Muestra todas las operaciones de picking activas en Odoo agrupadas por tienda y por operador: estado, cantidad de líneas y prioridad. Desde aquí se genera el **documento de picking** con código de barras que viaja físicamente con cada pallet durante todo el proceso de despacho.

### Despacho Hub (`/despacho`)
Pantalla de inicio del módulo de despacho. Acceso rápido a los sub-módulos según el perfil del usuario.

### Despacho Regiones (`/despacho/regiones`)
Gestión del despacho hacia tiendas fuera de la Región Metropolitana. Permite registrar las guías del día, genera automáticamente la plantilla de Sendu (sistema de transporte de Falabella) con todos los datos de la tienda destino, y produce el **manifiesto** que el conductor entrega en cada punto de entrega.

### Despacho Santiago (`/despacho/santiago`)
Registro de despacho para tiendas de la Región Metropolitana y Costa. Muestra el calendario de tiendas activas para el día, permite ingresar los ítems por tienda (pallets y bultos) y sincroniza los registros con Google Sheets.

### Rutas (`/despacho/santiago/rutas`)
Planificación y optimización de recorridos para el área metropolitana. Asigna tiendas a vehículos considerando tipo de tienda (mall, strip center), ventanas horarias de recepción y capacidad de carga. Integra Google Maps para visualizar el recorrido y detectar cortes o desvíos. Exporta la ruta a PDF para el conductor.

### Control de Flota (`/despacho/control-flota`)
Administración de vehículos disponibles y sus asignaciones del día. Los conductores registran la **carga en el camión** escaneando el código de barras de cada pallet y vinculándolo a la patente del vehículo, dejando trazabilidad de qué salió en qué camión y a qué hora.

### Panel de Conductores (`/panel-choferes`) · Hub Conductor (`/conductor-hub`) · Chofer (`/chofer`)
Interfaz para conductores. Muestra las entregas del día asignadas, permite registrar la carga en el vehículo mediante pistola de códigos de barras y consultar el detalle de cada parada.

### Estado de Despacho (`/despacho/estado`)
Panel de trazabilidad. Permite consultar en tiempo real el estado de cualquier despacho: qué salió, en qué vehículo, si fue entregado y si hay evidencia fotográfica de recepción en tienda.

### Conteo (`/despacho/conteo`)
Módulo de conteo de unidades para verificación de carga antes del despacho.

### Recepción en Tienda (`/recepcion-tienda`) · (`/recepcion`)
Flujo de confirmación de entrega para encargados de tienda. Al recibir el pedido, el encargado escanea el QR del manifiesto y sube una **fotografía de los pallets** como evidencia de recepción conforme. Cierra el ciclo del despacho con respaldo visual.

### Validación de Tienda (`/validacion-tienda`)
Verificación de identidad y acceso para el flujo de recepción en tienda mediante OTP.

### Auditoría (`/auditoria`) · Auditoría Admin (`/auditoria-admin`)
Módulo de auditoría de bodega integrado con Odoo. Permite revisar operaciones de salida (albaranes) por código, registrar resultados de auditoría (correcto, cruce, faltante, sobrante) con detalle por producto, y exportar los registros a Google Sheets y PDF. La vista admin incluye dashboard de métricas, historial completo y estadísticas por picker.

### Control Cruce (`/control-cruce`) · (`/control-interno/control-cruce`)
Verificación de cruces entre pedidos: detecta unidades que llegaron a una tienda distinta a la de origen.

### Panel de Operaciones (`/panel-operaciones`)
Vista consolidada del estado operativo del día para el equipo de coordinación: resumen de pickings, despachos en curso y entregas confirmadas.

### Incidencias (`/incidencias`)
Registro y seguimiento de incidencias del proceso logístico (entregas incompletas, daños, retrasos).

### Historial (`/historial`)
Consulta de despachos históricos con totales por tienda, fecha y tipo de carga.

### Control Interno (`/control-interno`)
Panel de administración operativa: gestión del calendario de despacho semanal y configuración de tiendas activas.

### Administración (`/admin`)
Panel exclusivo para administradores: gestión de usuarios y roles (`/admin/usuarios`), configuración del calendario central (`/admin/calendario`) y administración de tiendas (`/admin/tiendas`).

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS |
| Lenguaje | TypeScript 5 |
| Base de datos / Auth | Supabase (PostgreSQL + Auth + Realtime) |
| ERP | Odoo — integración vía JSON-RPC |
| Mapas | Google Maps API |
| Transporte Regiones | Sendu (Falabella) |
| Documentos | PDF.js · SheetJS |
| Sheets | Google Sheets API |
| Despliegue | Vercel |

---

## Roles y acceso

| Rol | Módulos habilitados |
|---|---|
| `admin` | Acceso total |
| `despachador` | Despacho, rutas, estado, conteo |
| `supervisor-picking` | Picking |
| `auditor` / `admin-auditoria` | Auditoría |
| `recepcion-tienda` | Recepción en tienda |
| `coordinador-flota` | Control de flota, panel choferes |
| `supervisor` | Panel de operaciones |
| `asistente-despacho` | Vistas de apoyo al despacho |

---

## Instalación

```bash
npm install
npm run dev   # http://localhost:3000
```

Variables de entorno requeridas en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_ODOO_URL=
NEXT_PUBLIC_ODOO_DB=
NEXT_PUBLIC_ODOO_USERNAME=
NEXT_PUBLIC_ODOO_API_KEY=

GOOGLE_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=

OTP_SECRET=
GMAIL_USER=
GMAIL_APP_PASS=
```

## Comandos

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Build de producción
npm test         # Tests unitarios (Vitest)
npm run lint     # Linting (ESLint)
```

---

## Estructura del proyecto

```
src/
├── app/                    # Rutas y páginas (Next.js App Router)
│   └── api/                # API Routes server-side
│       ├── odoo/           # Proxy Odoo JSON-RPC
│       ├── tiendas/        # Sync tiendas ↔ Google Sheets
│       └── ...
│
├── features/               # Lógica de dominio por módulo
│   ├── picking/            # Picking en bodega + hook Odoo
│   ├── despacho/
│   │   ├── regiones/       # Despacho regiones + Sendu
│   │   ├── santiago/       # Despacho RM
│   │   ├── rutas/          # Optimización de rutas + Google Maps
│   │   ├── estado/         # Trazabilidad de despachos
│   │   └── control-flota/  # Gestión de flota y carga
│   ├── auditoria/          # Auditoría de bodega
│   ├── tiendas/            # Recepción QR en tienda
│   └── control-interno/    # Admin calendario y tiendas
│
├── lib/                    # Utilidades compartidas
│   ├── supabase.ts         # Cliente Supabase (browser)
│   ├── supabaseServer.ts   # Cliente Supabase (server)
│   └── apiAuth.ts          # Validación JWT para API routes
│
└── components/             # Componentes globales (Auth, Toast, etc.)
```
