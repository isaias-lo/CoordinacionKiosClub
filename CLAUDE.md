# Cómo trabajar en este repositorio

Next.js 15 (App Router) · TypeScript · Supabase (Postgres, RLS, Realtime) · Google Sheets · Vitest · Vercel.

Este archivo existe porque una sesión de trabajo acumuló ocho errores que tenían **una sola causa**:
afirmar antes de verificar, y usar herramientas que fallan en silencio sin comprobar que hicieron lo
que se creía. Las reglas de abajo no son estilo — cada una nació de un bug concreto que llegó a
producción o estuvo a punto.

---

## Antes de afirmar algo

1. **Una sola sentencia SQL por llamada.** La herramienta MCP devuelve únicamente el resultado de la
   última sentencia. Mandar dos y leer una hizo concluir que `ruta_tiendas` no tenía foreign key.
   Las tenía.

2. **Ninguna consulta sin su tope de rango.** Hay filas con fechas imposibles en la base
   (8 manifiestos con `fecha = 2099-12-31`, creados el 26/06/2026). Una consulta de pendientes sin
   límite superior los contó como despachos válidos y dio 14 donde había 25.

3. **Antes de decir qué significa un campo**, leer las dos cosas: el texto que la UI le pone y la
   distribución de valores en la base. `en_servicio` se leyó como "fuera de servicio" por el nombre;
   la UI decía "ACTIVOS" y 15 de 23 camiones estaban en `false`.

4. **Antes de proponer cambiar un comportamiento, leer y citar el comentario que lo explica.** Este
   repositorio los tiene y son buenos: dicen *por qué* algo está así. Ignorarlos fue el error más
   repetido — una vez el comentario que desmentía la propuesta estaba tres líneas más arriba.

5. **Antes de consultar una tabla nueva desde el navegador, revisar sus políticas RLS.** Una tabla
   con RLS activo y **ninguna** política devuelve cero filas **sin error**. `rutas_despacho` es así:
   por eso el cálculo del backlog vive en `/api/backlog-v2`, en el servidor, con service role.

6. **No repetir el hallazgo de un agente explorador sin abrir el archivo.** Un resumen ajeno no es
   código leído. Si se va a citar `archivo:línea`, hay que haber visto esa línea.

---

## Al escribir código

7. **Verificar que el cambio llegó, no que compila.** Un reemplazo de texto que no encuentra su
   objetivo puede no fallar: `tsc`, los tests y el build pasan igual con el archivo intacto. Después
   de editar por script, comprobar el contenido.

8. **Toda edición por script falla fuerte.** Si el texto objetivo no aparece, salir con error
   nombrando el sitio. Nunca `cat >` sobre un archivo sin comprobar antes que no exista — así se
   sobrescribió `contenidoCarga.ts` entero.

9. **Un PR por cambio, y nunca empujar después de `gh pr create`.** Pasó con #490, #494 y #497: se
   mergea el primer commit y el resto queda huérfano. Verificar con
   `git log origin/main..origin/<rama>` antes de dar algo por cerrado.

---

## Verificación antes de commitear

En este orden, los cuatro en verde:

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build
```

---

## Testing

Al crear o modificar una funcionalidad, se escriben tests. No se pide permiso.

**El hábito clave:** cuando la lógica está enredada dentro de un componente o un handler, se extrae
la **parte pura** —una función sin UI ni red, que recibe datos y devuelve datos— a su propio archivo
y se testea esa función. Es barato y atrapa los bugs reales.

- Tests junto al código: `<carpeta>/__tests__/<nombre>.test.ts`.
- Vitest con `globals: true` (ver `vitest.config.ts`).
- **Sí:** funciones puras de negocio, parsers, normalizadores, validaciones y schemas (entradas
  válidas *e* inválidas), auth/tokens, serialización, colas offline.
- **No:** render de componentes, queries a la base, routing y middleware del framework.

Buenos ejemplos de este patrón ya en el repo: `rutas/utils/ventanaHoraria.ts`,
`rutas/utils/ordenConVentanas.ts`, `rutas/utils/factibilidadDia.ts`,
`rutas/utils/backlogSegundaVuelta.ts`.

---

## Trampas propias de este proyecto

### Las hojas de cálculo son POSICIONALES

Se escriben por posición (A, B, C…), no por nombre de encabezado. **Nunca reordenar ni insertar una
columna en medio: solo agregar al final.** Una columna insertada al medio corre todo lo que sigue y
rompe el parser sin dar error.

Cada hoja fija su ancho en varios sitios a la vez, y hay que ampliarlos juntos. Para `TIENDAS`
(hoy A..R, 18 columnas) son cuatro: `buildSheetRow` y los rangos de `api/tiendas/route.ts`, los tres
rangos de `api/tiendas/export-sheets/route.ts`, y los índices de `parseTSheetAuth`
(`rutas/utils/sheets.ts`).

*Excepción:* las hojas `ENTREGA/TIENDA` y `RECEPCIÓN/TIENDA` son por nombre desde #212.

### Bodega tiene DOS espejos: todo cambio va en los dos

- `santiago/steps/StepForm.tsx` → RM / Costa (contexto: `SantiagoContext`)
- `regiones/pages/TiendasPage.tsx` → Nacional (contexto: `AppContext`)

Son flujos paralelos con el mismo merge. Arreglar uno y olvidar el otro es el patrón que dejó el
chocolate corregido en un camino y roto en el otro. Al tocar uno, buscar el equivalente en el otro
antes de cerrar.

### Un campo que la tabla no tiene tumba el INSERT entero

Postgres rechaza el INSERT completo cuando se nombra una columna inexistente — no ignora el campo de
más. Con `if (error) console.error(...)` y seguir, la hoja se escribe, la base no, y nadie se entera.
Por eso existe la lista blanca `COLUMNAS_DESPACHO` en `api/sheets-write/mirror.ts`: **toda columna
nueva de `despacho_rm` / `despacho_regiones` hay que agregarla ahí**, o `paraMirror()` la descarta en
silencio.

### Fechas

- `todayISO()` usa UTC y rueda cerca de las 20:00 en Chile. Para límites de día usar la fecha
  **local** (`fechaISOLocal()` / `fechaChile()`), no `todayISO()`.
- Congelados despacha el **día hábil siguiente** (viernes → lunes); seco, el día siguiente.
  Ver `congelados/utils/diaDespachoCongelados.ts`.

### Hay DOS proyectos de Supabase, y no son copias: son MITADES

El viejo (`aiclobncdhxjxdlvkezk`) quedó congelado el 28/09/2026 y guarda toda la historia
anterior. El vivo (`epiwlmegimfftivqzzup`) **empieza justo donde el otro termina**. Medido el
07/10/2026:

| tabla | viejo | vivo |
|---|---|---|
| `picking_eventos` | 26.728 · 17/06 → 28/09 | 2.132 · 28/09 → hoy |
| `actividad_bodega` | 9.538 · 13/07 → 26/09 | 2.392 · 29/09 → hoy |
| `rutas_despacho` | 612 · 15/09 → 27/09 | 46 · 29/09 → hoy |

La excepción son los catálogos y el libro de despachos —`despacho_rm`, `despacho_regiones`,
`tiendas`, flota, roles— que SÍ migraron enteros. Por decisión del coordinador **la historia no se
trae al proyecto vivo**: el viejo queda como archivo de solo lectura, así que la ambigüedad es
permanente y los dos controles de abajo no son temporales.

**Por qué muerde:** las dos bases tienen datos parecidos hasta el 26/09, así que consultar la
equivocada devuelve algo **plausible en vez de un error**. El 29/09 eso llevó a afirmar que el 28 y
el 29 "no existían" en `despacho_rm`. Existían, en la otra base.

**El control de la configuración** lo hace `src/__tests__/mcpApuntaAlProyectoVivo.test.ts`: fija
que el `--project-ref` de `.mcp.json` sea el mismo de `.env.local`.

**El control de la sesión, que ningún test puede hacer:** el MCP se carga al ARRANCAR, así que una
sesión abierta antes de un cambio de `.mcp.json` sigue hablando con el proyecto de antes aunque el
archivo ya esté bien. Pasó el 07/10. **Antes de creerle a la primera consulta por MCP de cada
sesión**, pedirle el día más reciente de una tabla que se escriba a diario:

```sql
select max(date) from picking_pallets
```

Si no llega a hoy, es el proyecto viejo: reiniciar la sesión, o usar `~/.claude/kios/sql.mjs`, que
lee `SUPABASE_DB_URL` del `.env.local` y no depende del MCP.

### PostgREST corta en ~1000 filas

Las respuestas vienen topeadas. Para tablas con volumen hay que paginar con `.range()`, o se pierden
filas sin ningún aviso.

### Los conteos salen de lo GUARDADO en Bodega, no de Picking

Los chocolates suman como **bultos** en los totales; los contenedores suman como **pallets**. Es
consistente entre el modo Manual y el Enrutador, y es deliberado: si se unifican pallets o se suma un
chocolate a un pallet, el total válido es el que quedó registrado en bodega — que es lo que sale del
CD hacia la flota. **No recontar desde Picking.**
