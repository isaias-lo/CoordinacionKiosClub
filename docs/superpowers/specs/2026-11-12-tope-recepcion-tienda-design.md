# Tope de recepción por tienda — diseño

Fecha: 12/11/2026 · Pedido por el coordinador · Mockup: https://claude.ai/artifact/UhMWP8G45aZKqDL6TBPpBf

Hay tiendas que no pueden recibir más de cierta cantidad de pallets: el muelle, el ascensor o la
bodega del local no dan. El coordinador tiene esa información **en una lista impresa** —35 tiendas
de RM/Costa con su tope, entre 3 y 5— y hoy el sistema no la conoce. Bodega arma los pallets sin
saber cuántos aguanta la tienda que está cargando.

Esto trae ese número a la pantalla donde se decide.

---

## Qué es el tope, exactamente

Palabras del coordinador, 11/11/2026:

> «Es una señal para saber que se está excediendo la capacidad de la tienda, el que se pueda
> unificar lo deciden viendo esta información.»

Eso fija dos cosas que mandan sobre todo lo demás:

1. **El sistema informa, no ordena.** El chip dice *«5 de máx 4»*. Nunca *«hay que unificar»*.
   Unificar o no es una decisión de la persona, tomada mirando el dato.
2. **No bloquea nada.** Hay días en que el quinto pallet sale igual. El sistema no puede ser el que
   decide eso.

---

## Qué se construye

### 1. El dato

Columna nueva en `tiendas`:

```sql
alter table tiendas add column max_pallets smallint;
```

**Anulable a propósito.** Nulo es «sin tope», que es un estado real. Contado en la base el
12/11/2026, de 66 tiendas activas **35 tienen tope y 31 no**: 23 de Región, los cinco puntos más la
oficina, y tres sueltas que la lista no trae (`35BN2`, `62PLD`, `63CAL`). Si fuera `0 not null`,
esas 31 quedarían excedidas desde el primer pallet.

**No va a la hoja TIENDAS.** El precedente es `recepcion_pallet`: un campo por tienda que vive solo
en la base y en Config. Así no se tocan las cuatro piezas posicionales que `CLAUDE.md` marca como el
riesgo caro de este repositorio (`buildSheetRow`, los rangos de `api/tiendas`, los tres de
`export-sheets`, y los índices de `parseTSheetAuth`).

### 2. La regla, como función pura

Archivo nuevo: `src/features/despacho/shared/topeTienda.ts`. Sin React y sin red.

```ts
export type EstadoTope = 'sin-tope' | 'dentro' | 'al-tope' | 'excedido';

/** P + C. Un contenedor ocupa piso como un pallet; bultos y chocolates no. */
export function pisoOcupado(u: { pallet: number; contenedor: number }): number;

export function estadoTope(piso: number, tope: number | null | undefined): EstadoTope;

/** 'máx 5' cuando está dentro; '5 de máx 4' en los otros dos. Vacío si no hay tope. */
export function textoTope(piso: number, tope: number | null | undefined): string;
```

**Por qué el contenedor cuenta.** No es criterio nuevo: es la regla que ya rige en todo el
enrutamiento, fijada con tests en `poolDespacho`, `conteoFlota`, `backlogSegundaVuelta` y
`enrutadorIncremental`. `rutas/utils/historialTiendas.ts:46` lo dice textual:

> «Un contenedor ocupa piso como un pallet → cuenta para `techoPallets`. Bultos y chocolates no.»

**Qué se cuenta.** Lo **guardado en Bodega**, no lo que Picking imprimió. Regla de `CLAUDE.md`
(«Los conteos salen de lo GUARDADO en Bodega, no de Picking»). El aviso aparece cuando el quinto
pallet está pesado y guardado, no cuando hay cinco etiquetas impresas.

### 3. Dónde se ve

Dos lugares, **una edición cada uno**, porque las dos piezas ya son compartidas por Nacional y
RM/Costa:

| Lugar | Archivo | Qué se agrega |
|---|---|---|
| La fila de la lista | `shared/ListaTiendasUI.tsx` (`FilaTienda`) | El chip junto a la insignia de tipo |
| La tienda abierta | `shared/TiendaAbierta.tsx` (`CabeceraTienda`) | El chip en la ranura `indicador`, al lado del nombre |

`TiendaAbierta.tsx` lo deja escrito en su cabecera: *«Nacional y RM/Costa usan estas mismas piezas:
si cambian, cambian juntas.»*

Cada espejo aporta un mapa `topeByCod`, armado en el **mismo** `fetch('/api/tiendas')` que hoy arma
`tipoCatByCod` (`santiago/steps/StepForm.tsx` y `regiones/pages/TiendasPage.tsx`). Sin consulta
nueva. `GET /api/tiendas` suma `max_pallets` a su `select`.

**Los cuatro estados:**

| Estado | Se ve | Tono |
|---|---|---|
| `dentro` | `máx 5` | Gris apagado. Es referencia, no alarma. |
| `al-tope` | `5 de máx 5` | Azul del sistema. Llena no es mal — pero el próximo la pasa. |
| `excedido` | `4 de máx 3` | `--est-aviso`, el mismo ámbar de «sin pesar» y «tienda terminada». |
| `sin-tope` | nada | Sin tope no hay chip. |

Cuando está `dentro` el chip dice `máx 5` y no `3 de máx 5`: el 3 ya está dos renglones más abajo,
en el conteo por tipo, y en el teléfono el ancho es escaso.

### 4. Dónde se edita

Una **sexta pestaña «Topes»** en Config · Tiendas (`control-interno/TiendasAdminContent.tsx`), junto
a Tiendas, Calendario, Congelados, Transportistas y Bitácora. Archivo nuevo
`control-interno/TopesTab.tsx`, calcado de `TransportistasTab.tsx`: tabla, edición en línea,
guardado por fila con su estado (`idle` / `saving` / `ok` / `error`).

**Solo administra quien ya administra tiendas.** Reusa `canEditTiendas` en el cliente y `verifyAdmin`
en el servidor. Quien trabaja en Bodega ve el chip —que es lo que necesita— pero no mueve el número.
Decisión del coordinador: si el operador puede subir el tope, la salida más fácil frente a un ámbar
es cambiar el número en vez de unificar.

La tabla lista **todas** las tiendas activas, con buscador y un contador de cuántas quedan sin tope.

### 5. El endpoint

Nuevo y angosto: `PATCH /api/tiendas/tope`, cuerpo `{ codigo, max_pallets }` con
`max_pallets: number | null`. Valida con Zod (entero, 1..20, o nulo), exige `verifyAdmin`, escribe
**solo esa columna** y deja constancia con `registrarCambio`.

**Por qué no se reusa el POST que ya existe.** `api/tiendas/route.ts:178` es un upsert completo:
reescribe las 30 columnas y sincroniza la hoja con 8 segundos de espera. Desde una tabla donde se
pasa por cuarenta tiendas eso reescribiría la fila entera cada vez —con riesgo de vaciar campos que
la tabla no carga— y resincronizaría la hoja por una columna que la hoja ni tiene.

### 6. La carga inicial

Un script de una sola vez, en el scratchpad y no en el repositorio, que escribe los 35 topes de la
lista del coordinador. El calce nombre→código está verificado contra el catálogo y **no tiene
ambigüedades**: hay un solo «San Carlos» (`02SCL`), y «COSTANERA» (`20CTC`) y «NUEVA COSTANERA»
(`21NUC`) vienen como dos filas distintas en la lista.

---

## Qué NO hace

- **No bloquea.** Nunca impide guardar una unidad.
- **No sugiere.** No dice «unificá uno». El coordinador fue explícito.
- **No toca el Enrutador.** El motor sigue sin saber del tope declarado. Queda para después.
- **No guarda la letra G/M/P** de la lista. El catálogo ya tiene su `tipo`
  (Mall / Strip / Tienda) y una segunda clasificación es un dato más que mantener.
- **No va a la hoja de cálculo.**
- **No cuenta bultos ni chocolates.** No ocupan piso.

---

## Tests

`shared/__tests__/topeTienda.test.ts`, sobre la función pura:

- Sin tope (`null` y `undefined`) → `sin-tope`, texto vacío, en cualquier conteo.
- Dentro, justo en el tope, uno arriba.
- **Un contenedor empuja por encima sin que haya un pallet de más** — el caso que justifica todo:
  3 pallets + 1 contenedor sobre tope 3 es `excedido`.
- **Bultos y chocolates no mueven nada** — 2 pallets + 9 bultos sobre tope 3 sigue `dentro`.
- Tope `0` → excedido con una sola unidad (no se puede cargar en la UI, pero la función no miente).
- Cero unidades con tope → `dentro`.
- El texto: `máx 5` dentro, `5 de máx 5` al tope, `4 de máx 3` excedido.

No se testea el render de los componentes ni la consulta a la base, según `CLAUDE.md`.

---

## Lo que esto va a mostrar (medido)

Topes declarados contra piso realmente ocupado, 45 días hasta el 11/11/2026, desde
`picking_pallets`:

| Tienda | tope | promedio | pico | días que se pasó |
|---|---|---|---|---|
| San Carlos de Apoquindo | 3 | 2,4 | **7** | 9 de 26 |
| Costanera Center | 3 | 2,2 | 4 | 6 de 26 |
| Pie Andino | 3 | 2,4 | 5 | 5 de 25 |
| Luis Pasteur | 3 | 2,1 | 6 | 5 de 27 |
| Plaza de Armas | 3 | 1,9 | 6 | 4 de 18 |
| Nueva Costanera | 5 | 3,0 | 5 | 0 de 15 |

**Trece de las 35 no se pasaron nunca** en esos 45 días. Sus topes existen y no van a avisar nada, y
está bien: el ámbar va a salir en dos o tres tiendas por día, no en media pantalla. Un aviso que
aparece siempre deja de ser un aviso.

La medición también valida la lista: Costanera Center, que es un mall, tiene tope 3 y promedia 2,2;
Nueva Costanera, que es un strip center, tiene 5 y promedia 3,0. La inversión parecía un error de
transcripción y no lo es.

---

## Riesgos conocidos

**Un tope mal cargado produce un ámbar permanente.** Como no bloquea, el costo es que se ignore el
chip. Lo atenúa que lo mueva solo quien administra y que quede en la bitácora.

**El tope declarado y el medido pueden divergir.** `rutas/utils/historialTiendas.ts:53` ya calcula un
`techoPallets` por tienda (promedio + 1σ de pallets+contenedores, mismo día de semana) que el
Enrutador usa. Son dos números distintos: lo que la tienda **declara** y lo que **viene recibiendo**.
No se cruzan en esta versión. Cuando no coincidan, eso es información — y es la puerta natural a una
segunda etapa.
