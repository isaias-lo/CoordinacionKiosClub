# KiosClub — Sistema de Despacho

Aplicación web interna para gestionar el despacho diario de productos desde bodega hacia tiendas, tanto a nivel nacional (Regiones) como en la Región Metropolitana (Santiago).

## Funcionalidades

### Bodega Regiones
- Selección de tienda de destino con datos de la guía (orden, tipo de contenido, paquete, dimensiones, peso, valor)
- Registro de pallets y bultos por tienda
- Lectura de PDF de guías para extracción automática de números y montos
- Exportación a Excel usando una plantilla predefinida
- Envío automático de registros a Google Sheets (`DespachoRegiones`)

### Bodega Santiago
- Flujo por pasos: selección de régimen → formulario de items → resumen
- Registro de despachos para la RM
- Envío a Google Sheets (`DespachoSantiago`)

### Historial
- Listado de todos los despachos realizados (guardados en `localStorage`)
- Vista por tienda con totales de pallets, bultos, peso y monto
- Re-exportación de cualquier despacho anterior a Excel

### Pantalla de inicio
- Estadísticas acumuladas: días despachados, pallets totales y bultos totales
- Indicador de conexión a Google Sheets
- Acceso directo a Regiones, Santiago e Historial

## Tecnologías

| Capa | Tecnología |
|------|------------|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS 3 |
| Lenguaje | TypeScript 5 |
| PDF | pdfjs-dist 5 |
| Excel | xlsx (SheetJS) |
| Persistencia | localStorage |
| Integración | Google Apps Script (Sheets) |

## Instalación

```bash
npm install
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

## Estructura del Proyecto

```
src/
├── app/                        # App Router de Next.js
│   ├── page.tsx                # Pantalla de inicio (LaunchScreen)
│   ├── regiones/page.tsx       # Despacho Regiones
│   ├── santiago/page.tsx       # Despacho Santiago
│   └── historial/page.tsx      # Historial de despachos
│
├── features/
│   ├── despacho-regiones/      # Lógica de bodega Regiones
│   │   ├── components/         # BottomBar, StatsBar, TabBar
│   │   ├── data/tiendas.ts     # Catálogo de tiendas
│   │   └── utils/              # exportUtils, pdfUtils, sheetsRegiones
│   └── despacho-santiago/      # Lógica de bodega Santiago
│       ├── context/            # SantiagoContext
│       ├── steps/              # StepRegimen, StepForm, StepResumen
│       └── utils/sheetsSantiago
│
├── components/                 # Componentes compartidos (AppHeader, Toast, Card…)
├── context/AppContext.tsx       # Estado global (tiendas, dispatch, sheets, toast)
├── screens/                    # Pantallas montadas por las pages
├── hooks/useLocalStorage.ts
└── types.ts                    # Tipos globales (DispatchItem, Tienda, HistoryEntry…)
```

## Tipos de dato principales

- **`DispatchItem`** — un paquete (pallet o bulto) con orden, tipo de contenido, guía, peso, dimensiones y valor
- **`Tienda`** — tienda destino con código, región, comuna, RUT y datos de contacto
- **`HistoryEntry`** — snapshot de un día de despacho guardado en historial

