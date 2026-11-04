# Planilla de Picking — diseño

Fecha: 03/11/2026 · Pedido por el coordinador · Mockup: https://claude.ai/artifact/B4RMxhD2ueUYnXz4ryYvq8

Hoy la planilla se lleva **en papel**: una hoja por día con las tiendas del calendario, y a mano el
tipo, el picker y la cantidad de registros de cada movimiento. Todos esos datos ya están en el
sistema. Esto los junta en una pantalla que se puede imprimir con el mismo formato del papel.

---

## Qué se construye

Una pestaña **Planilla** en Picking, después de Actividad, con **dos vistas** y un botón de imprimir
que imprime *la vista en la que estás*. No guarda nada en la base: se arma al abrirla, con lo que
hay en el calendario y en Odoo.

La planilla **cambia con el día**: hoy muestra las tiendas de hoy, mañana las de mañana. No hay
selector de fecha en la primera versión — es la hoja del día, como el papel.

### Vista PLANILLA

La matriz del papel. Una fila por tienda, en el orden del calendario (Regiones, Costa, RM).
Columnas: `#` · `Tienda` · `Comida`+usuario · `Aseo`+usuario · `Hogar`+usuario · `Choc.`+usuario.
Al pie, una fila de **totales** por sección.

Cuando una sección tiene **más de un movimiento**, los números van **apilados en la misma celda**,
cada uno con su nombre en la misma línea — así es el papel. Medido el 03/11: pasa en 7 tiendas de
29, y siempre en una sola sección por tienda.

### Vista DETALLE

Una fila por movimiento, ordenada por hora de inicio, con `Inicio` · `Validado` · `Duración`.
La duración es la resta de las dos horas que ya trae Odoo: no hay que anotar nada. Es lo que el
papel no tiene y lo que permite ver quién se demoró.

### Imprimir

- Desde **Planilla**: hoja horizontal (carta apaisada) con bordes de celda, nombres abreviados
  («C. Labra»), totales y dos líneas de firma (Supervisor de Picking, Coordinador).
- Desde **Detalle**: la lista con las horas.

Además un **Bajar archivo** (CSV) en las dos vistas.

---

## De dónde sale cada dato

Todo lo de abajo está **medido**, no supuesto.

| Dato | Fuente | Nota |
|---|---|---|
| Tiendas del día | `todayStores` (`PickingScreen.tsx:1213`) | ya es calendario + adelantos, con las aperturas marcadas |
| Día de Odoo por tienda | `aperturasPorCod` (`PickingScreen.tsx:305`) + `consultasPorDia.ts` | una apertura pide su propio día |
| Zona de la tienda | `sector_comuna` y `lat` de `tiendas`, vía `grupoDeSector` / `esRegionNorte` (`lib/sectores.ts`) | |
| Sección | el `origin` del movimiento, vía `categoriaDeOrigin` (`despacho/shared/aperturaOdoo.ts`) | ya cubre `Abastecimiento Apertura <Sección>` |
| Picker | `user_id` traducido por `picker_canonical_names` | las cuentas son compartidas («Pickers 15» → Cristobal Labra) |
| **Registros** | **`move_ids.length`** | ver abajo: NO es el `lineCount` que ya existe |
| Hora de inicio | `user_assigned_date` | hay que agregarlo al mapeador; 101 de 119 lo tienen hoy |
| Hora de validación | `date_done` | ya está |

### Los registros: `move_ids.length`, no `lineCount`

`api/odoo/route.ts:241` ya expone un `lineCount` (el tipo, en la línea 66), pero cuenta `stock.move` **filtrando por estado**
(`assigned`, `partially_available`, `done`). Eso no es el número de Odoo: cuenta solo las líneas con
stock reservado, así que **crece durante el día** y recién calza cuando el movimiento se cierra.

Medido:

| día | movimientos | `move_ids` = `lineCount` | distintos |
|---|---|---|---|
| 29/10 (día cerrado) | 157 | 157 | 0 |
| 03/11 (día en curso) | 149 | 96 | **53** |

El número correcto es `move_ids.length`: es el que muestra Odoo y el que calzó con la hoja de papel
(24SPP Comida 111 y Aseo 24, 38SP2 Comida 119, 31TLC Hogar 100 — exactos).

**No se toca `lineCount`:** se agrega un campo nuevo al lado, para no cambiar nada de lo que ya lo usa.

### El número no cambia después de asignar

El coordinador pidió que el número sea el de la asignación. Se midió comparando el `create_date` de
cada línea contra `user_assigned_date` del movimiento: **771 movimientos asignados en 6 días
hábiles (27–31/10 y 2–3/11), cero líneas agregadas después**.

Por eso **no hace falta guardar una foto** del momento de asignar: leer Odoo en vivo ya da el número
de la asignación. Si algún día esto deja de ser cierto, el cambio sería persistir el conteo al
asignar, y entonces hay que volver a medirlo antes de hacerlo.

---

## Las reglas que no son obvias

**Solo el trabajo real.** Se muestran los movimientos en `assigned` y `done`. Se descartan los
`cancel` (anulados) y los `confirmed` (sin stock liberado, todavía no son trabajo). Medido el 03/11:
de 194 movimientos de las tiendas del día, van **119**; quedan fuera 50 anulados y 25 sin liberar.
Esto no es cosmético: mostrarlos daba líneas fantasma — 27MCH aparecía con dos movimientos de
Comida cuando tiene uno.

**Los `confirmed` se cuentan al pie**, no se esconden: «25 movimientos sin stock liberado».

**Una tienda del calendario sin carga va igual, en gris.** 75PUC está en el calendario del martes y
hoy no tiene ningún movimiento. Por eso la hoja de papel tiene 28 filas y el calendario 29: el papel
omite la que no tiene carga. En pantalla va, atenuada, porque «no tiene carga» es información.

**Los colores son los del calendario impreso.** Paleta exacta de
`CalendarioColumnas.tsx:436-442` (la función `handlePrint`), para que la planilla y el calendario se
lean igual:

| Zona | Fondo | Texto | Borde |
|---|---|---|---|
| Ruta Norte | `#FEF08A` | `#713F12` | `#FDE047` |
| Ruta Sur | `#BAE6FD` | `#0C4A6E` | `#7DD3FC` |
| Costa | `#99F6E4` | `#134E4A` | `#5EEAD4` |
| Mall RM | `#FECDD3` | `#881337` | `#FDA4AF` |
| Stripcenter / resto RM | blanco | `#1F2937` | `#9CA3AF` |

Con una regla que el sistema ya aplica y hay que respetar: **una tienda de Regiones que además es
MALL va pintada por su ruta, no de rosa.** El rosa es solo para los malls de RM. Hoy aplica a
46TRE, 36CHL y 60PBL.

La leyenda muestra las cinco zonas siempre, con las que están en cero atenuadas: el martes no hay
ninguna de Norte ni de Costa, y si no apareciera la fila la ausencia se leería como un dato que falta.

**Lo que no se sabe queda vacío.** 18 de los 119 movimientos de hoy no tienen hora de asignación,
porque todavía no se le dieron a nadie: la celda queda vacía y el usuario dice «sin asignar». No se
inventa una hora en una hoja que se firma.

**Las cuentas de Odoo sin persona salen con el nombre crudo, en ámbar.** Hoy son dos:
«Abastecimiento» (34SMB, 3 movimientos) y «06MQH» (04PDG, Comida). Así se ven y se les puede poner
nombre en Config · Pickers, en vez de desaparecer.

**Las horas son de Chile.** Odoo las guarda en UTC: hay que correrlas tres horas. 27MCH Hogar empezó
08:33, no 11:33. Para esto **no** sirve `todayISO()` (ver `CLAUDE.md`).

---

## Qué hay que tocar

**Backend** — `src/app/api/odoo/route.ts`:

1. Pedir `move_ids` y `user_assigned_date` en los `fields` de `stock.picking`.
2. Agregar al `BatchPicking` dos campos nuevos, **sin tocar `lineCount`**:
   `lineTotal: number` (= `move_ids.length`) y `assignedAt: string | null`.
3. Acción nueva `planilla_dia`: recibe `{ fecha, cods[] }` y devuelve los movimientos agrupados.
   Reutiliza el fetch que ya existe; filtra por estado como dice arriba.

**Lógica pura** (lo que se testea) — `src/features/picking/planilla/`:

- `agruparPlanilla.ts` → `filasPlanilla(movimientos, tiendasDelDia, zonaDe)`: una fila por tienda,
  cada celda la lista de sus movimientos ordenada por hora de asignación. Devuelve también los
  totales por sección y el conteo de descartados.
- `zonaColor.ts` → `zonaDeTiendaPlanilla(tienda)`: las cinco zonas, con la regla de que Regiones
  manda sobre MALL. **Importa la paleta desde un solo lugar compartido con `CalendarioColumnas`**,
  en vez de copiar los hexadecimales (hoy ya están duplicados en dos sitios dentro de ese archivo).
- `duracionMovimiento.ts` → la resta de las dos horas, y el formato («2 h 07», «20 min», «—»).
- `csvPlanilla.ts` → el texto del archivo, para las dos vistas.

**UI** — `src/features/picking/components/PlanillaTab.tsx`, más la pestaña nueva en el arreglo de
`PickingScreen.tsx:163`. El selector de tiendas **no hay que tocarlo**: `CON_SELECTOR`
(`selectorTiendas.ts:11`) es una lista blanca de dos pestañas (`monitoreo`, `congelados`), así que
cualquier pestaña nueva se repliega sola, como Calendario y Actividad.

**Impresión**: una `handlePrint` propia por vista, con el mismo patrón que ya usa
`CalendarioColumnas.handlePrint` (armar el HTML y abrir la ventana).

---

## Qué se testea

Tests junto al código, en `src/features/picking/planilla/__tests__/`:

- `agruparPlanilla`: una tienda con dos movimientos de la misma sección deja los dos en la celda,
  en orden de asignación; una tienda sin carga da una fila con las cuatro celdas vacías; un
  `cancel` y un `confirmed` no entran y sí se cuentan como descartados; los totales suman.
- `zonaDeTiendaPlanilla`: Región+MALL da la ruta, no `mall`; RM+MALL da `mall`; sector vacío no
  rompe; `Región Sur` y `Región` con `lat` dan el mismo resultado.
- `duracionMovimiento`: sin hora de inicio devuelve `null`; cruza bien el formato de horas y minutos.
- `csvPlanilla`: una celda con dos movimientos se serializa sin romper las columnas.

No se testea: el render del tab, la llamada a Odoo, la ventana de impresión.

---

## Lo que queda fuera de esta versión

- **Congelar el día.** Guardar cómo cerró la planilla para poder mirar un día de hace un mes.
  Hoy `picking_pallets` no tiene historia (ver memoria del proyecto), así que esto sería una tabla
  nueva. Vale la pena, pero después.
- **Selector de fecha.** La hoja es la del día.
- **La planilla de Chocolate como vista aparte.** El coordinador pidió «otra para Picking
  Chocolate»; en esta versión Chocolate es una columna de la misma hoja, como en el papel. Si
  después quiere una hoja propia, es el mismo armado filtrado por sección.
- **Editar en pantalla.** La planilla refleja Odoo; corregir un picker se hace en Odoo o en
  Config · Pickers.
