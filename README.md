# KiosClub — Sistema de Despacho

Aplicación web interna para gestionar el despacho diario de productos desde bodega hacia tiendas, tanto a nivel nacional (Regiones) como en la Región Metropolitana (Santiago), con enrutamiento de vehículos y auditoría de operaciones contra Odoo.

---

## Funcionalidades

### Bodega Regiones (`/despacho/regiones`)
- Selección de tienda destino con datos de la guía (orden, tipo de contenido, paquete, dimensiones, peso, valor)
- Lectura automática de PDF de guías para extraer números de orden y montos
- Exportación a Excel usando una plantilla predefinida (con fallback al template embebido si el guardado en `localStorage` está corrupto)
- Envío automático de registros a Google Sheets (`DespachoRegiones`) con selector de transporte **Carga / Falabella**
- Columnas enviadas a Sheets: ID, fecha, código tienda, tipo cargamento, régimen, transporte, tipo de carga, región/comuna destino, tipo de comuna (Urbano/Extraurbano), peso, dimensiones, peso volumétrico, estado, guía, valor

### Bodega Santiago (`/despacho/santiago`)
- Flujo por pasos: selección de régimen → formulario de ítems → resumen en tiempo real
- Formulario individual (un ítem a la vez) y formulario multi-ítem con preset de cantidades
- Calendario de tiendas para hoy con soporte de agregar/retirar tiendas del día
- Panel resumen con edición inline de cualquier ítem ya agregado
- Botón **Enrutar** disponible en tiempo real desde la vista de lista y desde el resumen (mobile y desktop)
- Envío a Google Sheets (`DespachoSantiago`)

### Enrutador (`/despacho/santiago/rutas`)
- Pre-carga automática de las tiendas y cantidades (pallets/bultos) registradas en Bodega Santiago
- Modos: **Calendario** (asignación automática por día) y **Manual** (texto libre)
- Asignación óptima de tiendas a vehículos con algoritmo nearest-neighbor por capacidad de pallets
- Vista de comparación Manual vs. Óptima con rebalanceo automático si un vehículo queda sobre su capacidad
- Paradas adicionales (entregas/retiros externos con geolocalización Google Maps)
- Sección de configuración de calendarios semanales por corredor
- Exportación de rutas a PDF e historial en Google Sheets
- Actualización de datos de tiendas, flota y calendario desde Google Sheets

### Auditoría (`/auditoria`)
- Búsqueda de operaciones de salida (albaranes) en Odoo por código de operación
- Proxy server-side (`/api/odoo`) que autentica contra Odoo vía JSON-RPC sin exponer credenciales al browser
- Configuración de conexión (URL, base de datos, usuario, API Key) guardada en `localStorage`
- Envío de resultados a Google Sheets (`Auditoria`)

### Historial (`/historial`)
- Listado de todos los despachos de Regiones realizados (guardados en `localStorage`)
- Vista por tienda con totales de pallets, bultos, peso y monto
- Re-exportación de cualquier despacho anterior a Excel

### Pantalla de inicio (`/`)
- Estadísticas acumuladas: días despachados, pallets totales y bultos totales
- Acceso directo a Regiones, Santiago, Rutas, Auditoría e Historial

---

## Tecnologías

| Capa | Tecnología |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS 3 |
| Lenguaje | TypeScript 5 |
| PDF | pdfjs-dist 5 |
| Excel | xlsx (SheetJS) |
| Mapas | Google Maps API (rutas) |
| Persistencia | localStorage |
| Integración externa | Google Apps Script (Sheets) · Odoo JSON-RPC |
| Despliegue | Vercel |

---

## Instalación

```bash
npm install
```

Crear `.env.local` con la clave de Google Maps:

```env
NEXT_PUBLIC_GOOGLE_MAPS_KEY=tu_clave_aqui
```

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

## Estructura del proyecto

```
src/
├── app/
│   ├── page.tsx                          # Pantalla de inicio
│   ├── auditoria/page.tsx                # Auditoría Odoo
│   ├── historial/page.tsx                # Historial de despachos
│   ├── despacho/
│   │   ├── regiones/page.tsx             # Bodega Regiones
│   │   └── santiago/
│   │       ├── page.tsx                  # Bodega Santiago
│   │       └── rutas/page.tsx            # Enrutador
│   └── api/
│       └── odoo/route.ts                 # Proxy server-side Odoo
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
│       │   ├── data/tiendas.ts
│       │   └── utils/exportUtils · pdfUtils · sheetsRegiones
│       │
│       ├── santiago/
│       │   ├── SantiagoPage.tsx
│       │   ├── steps/StepRegimen · StepForm · StepResumen
│       │   ├── context/SantiagoContext.tsx
│       │   ├── data/tiendasSantiago.ts
│       │   └── utils/sheetsSantiago.ts
│       │
│       └── rutas/
│           ├── RutasScreen.tsx
│           ├── components/
│           │   ├── InputSection · CalendarMode · ManualMode
│           │   ├── ResultsSection · RouteCard · ComparisonView
│           │   ├── ManualDispatch · ParadasAdicionales
│           │   ├── ConfigPanel · Header · MapSection · FlotaGrid
│           ├── data/tiendas · flota · calendar
│           └── utils/routing · maps · sheets · helpers
│
├── components/                           # Componentes globales (Toast, modals…)
├── context/AppContext.tsx                # Estado global (despacho regiones, toast)
├── data/template.ts                      # Plantilla Excel embebida (base64)
└── types.ts                              # DispatchItem · Tienda · HistoryEntry
```

---

## Tipos de dato principales

- **`DispatchItem`** — paquete (pallet o bulto) con orden, tipo de contenido, guía, peso, dimensiones y valor (Regiones)
- **`SantiagoItem`** — ítem de despacho Santiago con tipo, contenido, dimensiones, peso volumétrico y estado
- **`TiendaSantiago`** — tienda RM con código, dirección, ventana horaria y días de despacho
- **`HistoryEntry`** — snapshot de un día de despacho guardado en historial
- **`StoreItem`** — tienda con pallets/bultos para el enrutador `{ c, p, b }`
- **`Vehiculo`** — vehículo de la flota con capacidad, patente y conductor
