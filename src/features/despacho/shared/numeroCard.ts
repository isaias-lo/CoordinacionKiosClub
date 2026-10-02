// El número que muestra una card de Bodega (P1, B2, CH3…). Puro y testeable.
//
// ── UNA SOLA REGLA: EL NÚMERO ES EL QUE ESTÁ IMPRESO (30/09/2026) ──────────────────────────────
//
// El `seq` es el número que quedó IMPRESO en la etiqueta: va dentro del `canonical_id`
// (`P3<cod><stamp>P`) y se congela al imprimir (Picking) o al crear el slot (Bodega). No se
// recalcula nunca, así que sobrevive a que borren, unan o sumen a sus vecinos.
//
// Hasta hoy SOLO el chocolate lo usaba. Todo lo demás se numeraba por POSICIÓN en la lista, y eso
// produjo dos daños distintos:
//
//   1· EN PANTALLA. El 30/09, en 16PQA, la persona abrió la tienda antes de que terminara de
//      cargar `picking_pallets`. El formulario se rearmó con lo único que tenía —el pallet ya
//      pesado— y lo llamó P1; cuando los slots llegaron, el backfill agregó el verdadero P1 AL
//      FINAL de la lista. Resultado: el P2 pasó a llamarse P1 y pareció que habían borrado un
//      pallet. No habían borrado nada — el slot estuvo vivo todo el día. Le pasó a dos personas
//      el mismo día, porque es una carrera de tiempo y no depende de la cuenta.
//
//   2· EN LOS DATOS, y es peor. El id de la fila de la planilla se arma con el `orden`
//      (`${orden}${cod}${stamp}${prefijo}`) y el `canonical_id` del slot se arma con el `seq`. En
//      cuanto la numeración tiene un hueco, los DOS IDENTIFICADORES DE LA MISMA UNIDAD dejan de
//      coincidir. Es literalmente lo que pasó con 55ITA el 28/09: el slot `P1` guardaba 9.357,5 kg
//      y la fila `P2` de la planilla guardaba 335,7. Y es lo que hizo que el rescate de kilos
//      perdidos solo alcanzara a 19 filas: cruza por `canonical_id = id`, y donde no calzan, no
//      encuentra nada.
//
// Ahora la regla es una sola para todas las clases: **el número es el `seq`**. Medido antes de
// tocarlo, sobre las unidades vivas: 97,1% de los pallets, 98,2% de los bultos y 98,9% de los
// chocolates ya tienen `seq`, y NINGUNA pareja de unidades vivas comparte uno.
//
// Consecuencia buscada: los números pueden quedar con huecos (P2, P5). El hueco es información
// —dice que esos se fueron a un pallet o se borraron— y no un error que haya que "compactar".
//
// ── LA UNIDAD SIN `seq` NO PUEDE PISAR A NADIE ─────────────────────────────────────────────────
//
// El 1-3% que no tiene `seq` (nunca se imprimió) caía a su posición, y ahí había un agujero que
// esta versión tapa: con `P1(seq 1)`, `P3(seq 3)` y una tercera sin `seq`, la tercera salía en
// posición 3 → `P3` → **el MISMO id de fila que la segunda**, y una pisaba a la otra en la
// planilla. Por eso el reparto ya no es "tu posición" sino "el menor número que nadie tomó"
// (`repartirNumeros`). El agujero existía ya para el chocolate; se tapa para todos de una vez.
//
// ── LA ADQUISICIÓN Y EL WEB/RETIRO TIENEN SU PROPIA SERIE (29/09/2026) ────────────────────────
//
// Nacieron compartiendo la serie del bulto: la idea era que un tipo nuevo se numerara solo, sin
// tocar nada, cayendo en el `return 'bulto'` final. Salía gratis, pero salía MAL, y de dos formas:
//
//   · En pantalla se llamaban B4, B5 — indistinguibles de un bulto de verdad.
//   · En RM/Costa el contador del alta era `filter(i => i.tipo === 'Bulto')`, que NUNCA coincide
//     con 'Adquisicion'. Tres adquisiciones recibían las tres el mismo número, y como el ID de la
//     fila es `${orden}${cod}${stamp}${prefijo}`, las tres colapsaban en UNA fila de la planilla.
//
// Ahora son dos clases propias, con su letra: A1, A2, A3 y W1, W2, W3. La letra ya existía
// —`PREFIJO_ADQUISICION` / `PREFIJO_WEB_RETIRO`, usadas para el ID— así que lo que se hizo fue
// que la pantalla y el `orden` digan lo mismo que el ID ya venía diciendo.
//
// Los TOTALES no cambian: siguen sumando como bulto donde se cuentan (`getStats`). Lo que cambia
// es la identidad de cada unidad, que es lo que tiene que ser único.

import {
  esAdquisicion, esWebRetiro, PREFIJO_ADQUISICION, PREFIJO_WEB_RETIRO,
} from './adquisicion';

/** ¿Este `seq` sirve como número? Se exige entero positivo: nunca debe salir "P0" ni "PNaN". */
function seqUsable(seq: unknown): seq is number {
  return typeof seq === 'number' && Number.isInteger(seq) && seq > 0;
}

/**
 * Reparte los números de UNA clase: cada unidad se queda con su `seq` impreso, y la que no lo
 * tiene recibe **el menor número que nadie haya tomado**.
 *
 * Lo segundo no es un detalle. Darle su posición a la unidad sin `seq` era lo que podía hacerle
 * escupir el número de otra: con `[seq 1, seq 3, sin seq]` la tercera caía en posición 3 y salía
 * `P3`, el mismo id de fila que la segunda — y en la planilla una pisaba a la otra sin avisar.
 * Empezando por el 1 y salteando lo ocupado, sale `P2`, que es un hueco libre de verdad.
 *
 * El orden de la lista NO influye en el número de quien trae `seq`; solo decide, entre las que no
 * lo traen, cuál se lleva el primer hueco. Esa es toda la dependencia del orden que queda.
 */
export function repartirNumeros(seqs: readonly (number | null | undefined)[]): number[] {
  const propio = seqs.map(s => (seqUsable(s) ? s : null));
  const tomados = new Set<number>();
  for (const s of propio) if (s !== null) tomados.add(s);
  let libre = 1;
  return propio.map(s => {
    if (s !== null) return s;
    while (tomados.has(libre)) libre += 1;
    tomados.add(libre);
    return libre;
  });
}

/**
 * El número de una unidad que se está guardando recién, dados los `seq` de sus hermanas de clase.
 *
 * Existe porque al guardar el `orden` se fija UNA vez y no se vuelve a calcular: si ahí se usara la
 * posición, la unidad sin `seq` volvería a poder pisar a otra. Es el mismo reparto, con la nueva
 * al final.
 */
export function numeroParaUnidadNueva(
  seqsHermanas: readonly (number | null | undefined)[], seqNueva?: number | null,
): number {
  const nums = repartirNumeros([...seqsHermanas, seqNueva]);
  return nums[nums.length - 1];
}

/**
 * El campo `orden` de un item, con el formato histórico que se escribe a Sheets.
 *
 * El bulto lleva el número ADELANTE (`3B`) y los demás atrás (`P3`, `C3`, `CH3`). No es un
 * capricho: ese string se concatena para formar el ID de la fila
 * (`${orden}${cod}${stamp}${tipoPrefix}`), que para un CH queda `CH3<cod><stamp>CH` — exactamente
 * el formato de `buildCanonicalId`. Por eso el número del CH tiene que ser el mismo `seq` que va
 * en el código de barras: si no, el ID de Sheets y la etiqueta impresa hablan de cosas distintas.
 */
export function ordenDeItem(tipo: string, numero: number): string {
  if (tipo === 'Pallet') return `P${numero}`;
  if (tipo === 'Contenedor') return `C${numero}`;
  if (tipo === 'Chocolate') return `CH${numero}`;
  if (esAdquisicion(tipo)) return `${PREFIJO_ADQUISICION}${numero}`;
  if (esWebRetiro(tipo))   return `${PREFIJO_WEB_RETIRO}${numero}`;
  return `${numero}B`;
}

/**
 * Etiqueta VISIBLE de una card: `P3` / `C3` / `CH3` / `B3`.
 *
 * Ojo con la diferencia: acá el bulto lleva el número atrás (`B3`) y en `ordenDeItem` lo lleva
 * adelante (`3B`). Son dos formatos históricos distintos —uno es lo que se ve en pantalla, el otro
 * lo que se escribe a Sheets— y confundirlos cambia el ID de las filas sin que se note.
 */
export function etiquetaCard(tipo: string, numero: number): string {
  if (tipo === 'Pallet') return `P${numero}`;
  if (tipo === 'Contenedor') return `C${numero}`;
  if (tipo === 'Chocolate') return `CH${numero}`;
  if (esAdquisicion(tipo)) return `${PREFIJO_ADQUISICION}${numero}`;
  if (esWebRetiro(tipo))   return `${PREFIJO_WEB_RETIRO}${numero}`;
  return `B${numero}`;
}

/**
 * Las cuatro clases de envase, en el vocabulario neutro del módulo. Cada formulario habla el suyo
 * —Santiago dice 'Pallet'/'Chocolate', Nacional dice 'pallet'/'chocolate'— y traduce al entrar.
 */
export type ClaseEnvase = 'pallet' | 'bulto' | 'contenedor' | 'chocolate' | 'adquisicion' | 'webretiro';

/** Las clases, en un solo lugar: sirve para los contadores y para no olvidarse de ninguna. */
export const CLASES_ENVASE: ClaseEnvase[] =
  ['pallet', 'bulto', 'contenedor', 'chocolate', 'adquisicion', 'webretiro'];

/** Un contador por clase, en cero. */
export function contadorPorClase(): Record<ClaseEnvase, number> {
  return { pallet: 0, bulto: 0, contenedor: 0, chocolate: 0, adquisicion: 0, webretiro: 0 };
}

/**
 * Cuántas unidades hay de cada clase. UN SOLO contador para toda la pantalla.
 *
 * ── POR QUÉ (01/10/2026) ───────────────────────────────────────────────────────────────────────
 *
 * El coordinador preguntó por qué las adquisiciones y los web/retiro no se sumaban en el
 * encabezado de la tienda. Al mirarlo apareció algo peor: había DOS cuentas distintas para la
 * misma tienda, en la misma pantalla, y daban números distintos.
 *
 *   · La tarjeta de la lista contaba los bultos POR RESTA — `total − pallets − contenedores −
 *     chocolates—, así que las adquisiciones y los web/retiro caían ahí adentro. 07CCR decía 5B.
 *   · El encabezado los contaba por IGUALDAD de texto (`i.tipo === 'Bulto'`), que nunca coincide
 *     con 'Adquisicion' ni con 'WebRetiro', así que no los contaba en ningún lado. Decía 1B.
 *
 * Es el mismo error de siempre en este archivo — comparar `tipo` con un string en vez de usar la
 * clase — y ya había mordido dos veces: en el contador del alta (#611, tres adquisiciones con el
 * mismo número colapsándose en una fila) y en el Manual (#617, invisibles en todas las líneas).
 *
 * Esta función existe para que no haya una tercera. Las seis clases salen de `CLASES_ENVASE`, así
 * que una clase nueva aparece sola en los dos lugares.
 */
export function contarPorClase<T>(
  items: readonly T[], claseDe: (item: T) => ClaseEnvase,
): Record<ClaseEnvase, number> {
  const cuenta = contadorPorClase();
  for (const item of items) cuenta[claseDe(item)] += 1;
  return cuenta;
}

/** Traduce el `tipo` de Santiago ('Pallet' | 'Bulto' | 'Contenedor' | 'Chocolate'). */
export function claseSantiago(tipo: string): ClaseEnvase {
  if (tipo === 'Pallet') return 'pallet';
  if (tipo === 'Contenedor') return 'contenedor';
  if (tipo === 'Chocolate') return 'chocolate';
  if (esAdquisicion(tipo)) return 'adquisicion';
  if (esWebRetiro(tipo))   return 'webretiro';
  return 'bulto';
}

/** Traduce el `pkg` de Nacional ('pallet' | 'box' | 'contenedor' | 'chocolate'). */
export function claseNacional(pkg: string): ClaseEnvase {
  if (pkg === 'pallet') return 'pallet';
  if (pkg === 'contenedor') return 'contenedor';
  if (pkg === 'chocolate') return 'chocolate';
  if (esAdquisicion(pkg)) return 'adquisicion';
  if (esWebRetiro(pkg))   return 'webretiro';
  return 'bulto';
}

/** `orden` en el vocabulario de Nacional: `pallet1` / `bulto1` / `contenedor1` / `chocolate1`. */
export function ordenNacional(clase: ClaseEnvase, numero: number): string {
  return `${clase === 'bulto' ? 'bulto' : clase}${numero}`;
}

/**
 * El número que le toca a cada item: su `seq` impreso, y si no lo tiene, el menor hueco libre de
 * su clase.
 *
 * Es el corazón de los cinco bloques `let pc = 0, bc = 0, cc = 0, chc = 0; …` que estaban copiados
 * por el formulario —uno por cada operación que rearma la lista (unificar, guardar, sumar, borrar)—.
 * Que estuviera repetido es la razón por la que el renumerado se colaba por todos lados: había que
 * arreglarlo en los cinco o no se arreglaba en ninguno.
 *
 * Cada clase reparte por separado: el `seq` de `picking_pallets` es una serie por
 * (tienda, fecha, tipo), así que el P3 y el CH3 de una misma tienda son dos unidades distintas y
 * ninguno estorba al otro.
 */
export function numerarPorClase<T>(
  items: T[], claseDe: (item: T) => ClaseEnvase, seqDe: (item: T) => number | null | undefined,
): { item: T; clase: ClaseEnvase; numero: number }[] {
  const clases = items.map(claseDe);
  const indicesPorClase = new Map<ClaseEnvase, number[]>();
  clases.forEach((clase, i) => {
    const previos = indicesPorClase.get(clase);
    if (previos) previos.push(i); else indicesPorClase.set(clase, [i]);
  });
  const numero = new Array<number>(items.length);
  for (const indices of indicesPorClase.values()) {
    const repartidos = repartirNumeros(indices.map(i => seqDe(items[i])));
    indices.forEach((i, k) => { numero[i] = repartidos[k]; });
  }
  return items.map((item, i) => ({ item, clase: clases[i], numero: numero[i] }));
}

/** Reasigna el `orden` de los items de Santiago (`P3` / `3B` / `C3` / `CH3`). */
export function renumerarOrden<T extends { tipo: string }>(
  items: T[], seqDe: (item: T) => number | null | undefined,
): (T & { orden: string })[] {
  return numerarPorClase(items, i => claseSantiago(i.tipo), seqDe)
    .map(({ item, numero }) => ({ ...item, orden: ordenDeItem(item.tipo, numero) }));
}

/** Reasigna el `orden` de los items de Nacional (`pallet3` / `bulto3` / `chocolate3`). */
export function renumerarOrdenNacional<T extends { pkg: string }>(
  items: T[], seqDe: (item: T) => number | null | undefined,
): (T & { orden: string })[] {
  return numerarPorClase(items, i => claseNacional(i.pkg), seqDe)
    .map(({ item, clase, numero }) => ({ ...item, orden: ordenNacional(clase, numero) }));
}

/**
 * Le pone `orden` a lo que todavía no lo tiene y **no toca lo que ya lo tiene**.
 *
 * Existe para el reducer de Nacional, que renumera en cada alta y en cada borrado y NO puede ver el
 * `seq` (vive en el estado del componente, no en el ítem).
 *
 * Antes respetaba SOLO al chocolate y renumeraba por posición a los demás. Eso era coherente
 * mientras el pallet se numerara por posición; desde que el pallet usa su `seq`, renumerarlo acá
 * desharía en la acción siguiente justo lo que `numerarPorClase` acaba de calcular bien — que es
 * exactamente el bug que el chocolate ya había sufrido ("el CH3 volvía a llamarse CH1"), a punto
 * de repetirse con el P3.
 *
 * Una unidad sin `orden` (recién creada, antes de pasar por `numerarPorClase`) cae a su posición:
 * es provisorio y dura hasta el próximo renumerado con `seq` a la vista.
 */
export function renumerarSoloSinOrden<T extends { pkg: string; orden?: string }>(items: T[]): T[] {
  const cuenta = contadorPorClase();
  return items.map(item => {
    const clase = claseNacional(item.pkg);
    const posicion = ++cuenta[clase];
    if (item.orden) return item;   // ya tiene número: el de la etiqueta, y no se pisa
    return { ...item, orden: ordenNacional(clase, posicion) };
  });
}

// ── EL ÚLTIMO CANDADO: QUE DOS UNIDADES NO COMPARTAN EL ID DE SU FILA ──────────────────────────
//
// El id de la fila se arma con el `orden`: `${orden}${cod}${stamp}${prefijo}`. Y el `orden` se fija
// UNA VEZ, al guardar, con las hermanas VISIBLES EN ESE INSTANTE. `repartirNumeros` garantiza que
// no se repitan dentro de una llamada, pero **nada lo garantiza entre llamadas distintas**: si el
// segundo guardado no alcanza a ver al primero —el estado todavía no se mergeó, o el `seq` del slot
// no llegó al ref— las dos unidades toman el menor hueco libre y salen con el MISMO número.
//
// Pasó el 02/10/2026 con las dos adquisiciones de 26ALC, creadas a las 16:02 y 16:03: las dos con
// `orden: "A1"`, o sea el mismo id. Y el daño es doble, porque los dos destinos reaccionan
// distinto: `api/sheets-write` compara contra los ids que YA tiene la hoja, no dentro del lote, así
// que a la hoja le agrega LAS DOS filas con el id repetido; y el espejo a la base, que tiene el id
// como clave, se queda con UNA. Un lado confunde y el otro pierde.
//
// Medido sobre 955 filas con slot: en 95 (el 10%) el `orden` del id no coincide con el `seq`
// autoritativo del slot — están cruzados y rotados (07CCR: el seq 1 salió `2B` y el seq 2 salió
// `1B`). Que en esas 95 no haya chocado NADIE es suerte, no diseño.
//
// Esto no renumera nada que funcione: solo desempata lo repetido, y deja intacto a quien no choca.
// La etiqueta impresa de las unidades buenas no se mueve.

/** El número que lleva un `orden` ya escrito: `P3` → 3 · `3B` → 3 · `pallet12` → 12 · `CH2` → 2. */
export function numeroDeOrden(orden?: string | null): number | null {
  const m = String(orden ?? '').match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Desempata una lista de números: el PRIMERO que usa un número se lo queda, y los que lo repiten
 * pasan al menor hueco libre. Un número que no choca nunca cambia.
 *
 * Se apoya en `repartirNumeros`, que es la misma regla de siempre —"el tuyo si lo tenés, si no el
 * menor libre"—; lo único que agrega es borrarle el número al repetido para que entre al reparto.
 */
export function desempatarNumeros(numeros: readonly (number | null | undefined)[]): number[] {
  const vistos = new Set<number>();
  const sinRepetir = numeros.map(n => {
    if (n == null || !Number.isInteger(n) || n <= 0) return null;
    if (vistos.has(n)) return null;   // es el repetido: va al reparto
    vistos.add(n);
    return n;
  });
  return repartirNumeros(sinRepetir);
}

/** Agrupa por clase y desempata dentro de cada una. El P3 y el CH3 no se estorban. */
function desempatarPorClase<T>(
  items: readonly T[], claseDe: (item: T) => ClaseEnvase,
): { item: T; clase: ClaseEnvase; numero: number }[] {
  const clases = items.map(claseDe);
  const indicesPorClase = new Map<ClaseEnvase, number[]>();
  clases.forEach((clase, i) => {
    const previos = indicesPorClase.get(clase);
    if (previos) previos.push(i); else indicesPorClase.set(clase, [i]);
  });
  const numero = new Array<number>(items.length);
  for (const indices of indicesPorClase.values()) {
    const nums = desempatarNumeros(indices.map(i => numeroDeOrden((items[i] as { orden?: string }).orden)));
    indices.forEach((i, k) => { numero[i] = nums[k]; });
  }
  return items.map((item, i) => ({ item, clase: clases[i], numero: numero[i] }));
}

/** RM/Costa: desempata los `orden` repetidos de una tienda (`P3` / `3B` / `C3` / `CH3` / `A3`). */
export function desempatarOrdenSantiago<T extends { tipo: string; orden?: string }>(
  items: readonly T[],
): (T & { orden: string })[] {
  return desempatarPorClase(items, i => claseSantiago(i.tipo))
    .map(({ item, numero }) => ({ ...item, orden: ordenDeItem(item.tipo, numero) }));
}

/** Nacional: lo mismo en su vocabulario (`pallet3` / `bulto3` / `chocolate3`). */
export function desempatarOrdenNacional<T extends { pkg: string; orden?: string }>(
  items: readonly T[],
): (T & { orden: string })[] {
  return desempatarPorClase(items, i => claseNacional(i.pkg))
    .map(({ item, clase, numero }) => ({ ...item, orden: ordenNacional(clase, numero) }));
}

// ── LOS BULTOS QUE VIAJAN ─────────────────────────────────────────────────────────────────────
//
// Una adquisición y un web/retiro **suben al camión**. Son un paquete más que el chofer carga, le
// ocupa lugar y tiene que figurar en lo que el Enrutador reparte. Decisión del coordinador,
// 02/10/2026: van sumados a los BULTOS.
//
// Hasta ahora no figuraban en ningún lado. Diez contadores distintos preguntaban
// `i.tipo === 'Bulto'` —o `i.pkg === 'box'`—, que NUNCA coincide con 'Adquisicion' ni con
// 'WebRetiro', así que los agregados salían del conteo en la cabecera de Bodega, en el resumen por
// tienda, en el banner del borrador y en `despacho_sesion`, que es de donde el Enrutador lee. En
// 01TPS el 02/10 la cabecera decía «13 pesados» y el bloque de cruce «14 unidades»: la que faltaba
// era la adquisición.
//
// Es el MISMO error que el #610 arregló en la numeración y que `adquisicion.ts` ya documenta. Que
// haya vuelto en los contadores es la señal de que la regla tenía que vivir en UN solo lugar.
//
// ── DÓNDE *NO* VAN ────────────────────────────────────────────────────────────────────────────
//
// En el CRUCE DE PESOS no entran, y eso no cambia: ahí se compara el abastecimiento de Odoo contra
// lo que Bodega pesó de ESE abastecimiento, y una compra o un pedido del cliente no existen del
// lado de Odoo. Sumarlos inflaría ese lado. Son dos preguntas distintas: «¿cuántos paquetes sube
// el camión?» los incluye; «¿cuánto de lo que mandó Odoo pesamos?» no.
//
// Tampoco en los condicionales de PANTALLA (`row.tipo === 'Bulto'` para pedir largo y ancho): una
// adquisición no lleva medidas. Esos quedan como están, a propósito.

/** Las clases que el chofer carga como un bulto. */
const VIAJAN_COMO_BULTO: ReadonlySet<ClaseEnvase> = new Set(['bulto', 'adquisicion', 'webretiro']);

/** Cuántos paquetes viajan como bulto: el bulto propiamente dicho más los agregados. */
export function bultosQueViajan<T>(items: readonly T[], claseDe: (item: T) => ClaseEnvase): number {
  return items.filter(i => VIAJAN_COMO_BULTO.has(claseDe(i))).length;
}

/** RM/Costa, por `tipo`. */
export function bultosSantiago<T extends { tipo: string }>(items: readonly T[]): number {
  return bultosQueViajan(items, i => claseSantiago(i.tipo));
}

/** Nacional, por `pkg`. */
export function bultosNacional<T extends { pkg: string }>(items: readonly T[]): number {
  return bultosQueViajan(items, i => claseNacional(i.pkg));
}
