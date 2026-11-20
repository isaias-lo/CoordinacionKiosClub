// El ranking de productividad DENTRO de una especialidad, y el índice contra su propio promedio.
//
// ── POR QUÉ NO UN RANKING SOLO ────────────────────────────────────────────────────────────────
//
// Porque las tres especialidades no se mueven en la misma escala. Medido del 1 al 16/11/2026 y
// documentado en `especialidad.ts`:
//
//     Christian Flores · en SECO ........ 726 u/h
//     Christian Flores · en CONGELADOS ... 52 u/h
//     Mario Patiño · especialistas ....... 56 u/h   ← los que hacen congelados todos los días
//
// Congelados es ~14 veces más lento por unidad: cámara, peso, guantes. Un ranking único pondría a
// los de congelados al fondo todos los días sin que nadie trabaje mal, y escondería que Flores
// cubriendo rinde prácticamente igual que los especialistas (52 contra 56). Por eso se ordena
// dentro de cada especialidad y el índice se calcula contra el promedio DE ESA especialidad.
//
// ── EL ÍNDICE ES EL FACTOR DE MARIO, CON EL DENOMINADOR CORRECTO ──────────────────────────────
//
// La hoja «Bono Picking» calcula `Factor CPH = MAX(0,75; MIN(10; CPH_persona / $F$1))`, donde
// `$F$1` es UN promedio para todo el mundo — el del bloque seco, aplicado también al bloque de
// congelados. Acá es la misma división, contra el promedio de la especialidad de cada uno:
//
//     indice = cph / promedio de su especialidad      1,00 = va en el promedio de los que hacen lo mismo
//
// No se le pone piso ni techo a propósito: el piso de 0,75 y el tope de 10 son reglas de PAGO, de
// la jefatura, y acá se está midiendo, no pagando. Mezclarlos escondería justo lo que interesa ver.
//
// ── LOS CEROS NO ENTRAN AL PROMEDIO ───────────────────────────────────────────────────────────
//
// Es el defecto ② de la hoja: su `AVERAGE(L6:L25)` barre 20 celdas de las que 3 valen cero —una
// persona sin trabajo y dos filas vacías— y eso le baja el objetivo un 10% a todo el mundo. Acá
// una fila sin horas medidas no promedia ni se rankea: se devuelve aparte, en `sinMedir`, para
// que se vea que existe en vez de desaparecer.

import type { Especialidad } from './especialidad';

/** Lo mínimo para rankear. Lo cumple `PickerStatRow`. */
export interface FilaRankeable {
  /** Unidades por hora. Es la métrica del ranking. */
  cph: number;
  /** Minutos de reloj. Sin esto no hay ritmo que comparar. */
  totalMinutes: number;
  /** Operaciones con las dos horas. Es el tamaño de la muestra. */
  opsMedidas?: number;
}

export interface Puesto<F> {
  /** 1-based. Dos ritmos iguales comparten puesto y el siguiente salta — como en una carrera. */
  puesto: number;
  fila: F;
  /** `cph` dividido por el promedio de la especialidad. `null` si no hay promedio con qué dividir. */
  indice: number | null;
}

export interface RankingEspecialidad<F> {
  especialidad: Especialidad;
  /** Promedio de u/h de las filas que entraron. 0 si no entró ninguna. */
  promedio: number;
  /** Cuántas filas promediaron. Un promedio de una sola fila no dice nada: el llamador decide. */
  comparables: number;
  puestos: Puesto<F>[];
  /** Las que no se pudieron medir: sin horas de reloj, o con ritmo cero. No promedian. */
  sinMedir: F[];
  /** El mínimo de operaciones que se exigió para promediar. Va en el resultado para que la
   *  pantalla pueda DECIRLO: es un número que cambia con el período y nadie lo adivina. */
  minOps: number;
}

/** El piso: una sola operación no es un ritmo, es una anécdota. */
const MIN_PISO = 2;
/** El techo: es el número medido para el mes — ver abajo. */
const MIN_TECHO = 10;
/** De qué fracción del más cargado se parte. */
const MIN_DIVISOR = 3;

/**
 * Cuántas operaciones hace falta tener para entrar al promedio DE ESTE período.
 *
 * ── POR QUÉ NO ES UN NÚMERO FIJO ──────────────────────────────────────────────────────────────
 *
 * Porque el período cambia el tamaño de la muestra, y un número fijo sirve en uno y rompe el
 * otro. Medido sobre noviembre de 2026 (1 al 19), contando operaciones con las dos horas:
 *
 *     seco, por persona y por DÍA ....... mediana 4 · sólo el 1% de 316 parejas llega a 10
 *     seco, por persona y por MES ....... mediana 50 · 27 de 29 llegan a 10
 *
 * Con un mínimo fijo de 10, la vista de un día **no tiene promedio**: el miércoles 18 ninguna de
 * las 23 personas llegó, y el 11 ninguna de 17. Sin promedio no hay índice, así que la pantalla
 * se queda sin su columna justo en la vista que más se mira.
 *
 * ── Y POR QUÉ RELATIVO AL MÁS CARGADO ─────────────────────────────────────────────────────────
 *
 * Lo pidió el coordinador con un caso concreto: si entra más gente al área, el mismo trabajo se
 * parte en pedazos más chicos y cualquier umbral fijo deja de alcanzarse. Probado repartiendo las
 * 71 operaciones de seco del 18/11 entre más gente: con 23, 30 y 40 personas el mínimo relativo
 * se acomoda solo a 2 y el promedio existe; con el 10 fijo los tres casos dan cero.
 *
 * ── LOS TRES NÚMEROS ──────────────────────────────────────────────────────────────────────────
 *
 * - **Un tercio del más cargado** es lo que se ajusta al período sin tener que retocarlo.
 * - **Piso de 2** porque una operación suelta no es un ritmo.
 * - **Techo de 10** porque es el valor que ya se validó para el mes, y con el techo puesto el mes
 *   da exactamente lo mismo que el 10 fijo: 27 de 29 en seco, 3 de 19 en chocolates, 2 de 2 en
 *   congelados.
 *
 * Lo que da en cada período, medido:
 *
 *     mié 18 · un día   · seco ......... máx   7 → mínimo  3 · promedian 13 de 23
 *     vie 06 · un día   · seco ......... máx   6 → mínimo  2 · promedian 22 de 24
 *     vie 06 · un día   · chocolates ... máx  10 → mínimo  4 · promedian  2 de  8
 *     16–19  · semana   · seco ......... máx  22 → mínimo  8 · promedian 21 de 26
 *     1–19   · el mes   · seco ......... máx  72 → mínimo 10 · promedian 27 de 29
 *
 * **Una advertencia sobre esas cifras:** están medidas por CUENTA de Odoo, y las filas que llegan
 * acá son por PERSONA, con las cuentas de quien usó dos pistolas ya juntas. Juntar cuentas sólo
 * SUMA operaciones por fila, así que la mediana diaria de 4 es un piso y no un techo: el problema
 * del 10 fijo es igual de real o más.
 *
 * Se calcula sobre las filas MEDIBLES, las mismas a las que se les va a aplicar: tomar el máximo
 * de una fila sin horas subiría la vara con una operación que después no promedia.
 */
export function minOpsDelPeriodo(filas: readonly FilaRankeable[]): number {
  let max = 0;
  for (const f of filas) {
    if (!((Number(f.totalMinutes) || 0) > 0) || !((Number(f.cph) || 0) > 0)) continue;
    const ops = Number(f.opsMedidas) || 0;
    if (ops > max) max = ops;
  }
  return Math.min(MIN_TECHO, Math.max(MIN_PISO, Math.ceil(max / MIN_DIVISOR)));
}

/** Redondeo a dos decimales sin arrastrar el error binario de `toFixed`. */
const dos = (n: number): number => Math.round(n * 100) / 100;

/**
 * Ordena las filas de UNA especialidad y calcula el índice de cada una.
 *
 * `minOpsMedidas` deja fuera del PROMEDIO —no del ranking— a las muestras chicas. Va en 0 por
 * defecto a propósito: el número que corresponda hay que medirlo, y hasta entonces no se inventa
 * uno acá. Quien llama decide y queda a la vista en su propio código.
 */
export function rankingDeEspecialidad<F extends FilaRankeable>(
  especialidad: Especialidad,
  filas: readonly F[],
  minOpsMedidas = 0,
): RankingEspecialidad<F> {
  const medibles: F[] = [];
  const sinMedir: F[] = [];
  for (const f of filas) {
    const min = Number(f.totalMinutes) || 0;
    const cph = Number(f.cph) || 0;
    if (min > 0 && cph > 0) medibles.push(f);
    else sinMedir.push(f);
  }

  const promedian = medibles.filter(f => (Number(f.opsMedidas) || 0) >= minOpsMedidas);
  const promedio = promedian.length
    ? promedian.reduce((a, f) => a + (Number(f.cph) || 0), 0) / promedian.length
    : 0;

  // Mayor ritmo primero. El empate comparte puesto: ordenar por otra cosa sería inventar un
  // desempate que los datos no tienen.
  const ordenadas = [...medibles].sort((a, b) => (Number(b.cph) || 0) - (Number(a.cph) || 0));
  const puestos: Puesto<F>[] = [];
  let puesto = 0;
  let anterior: number | null = null;
  ordenadas.forEach((fila, i) => {
    const cph = Number(fila.cph) || 0;
    if (anterior === null || cph !== anterior) { puesto = i + 1; anterior = cph; }
    puestos.push({ puesto, fila, indice: promedio > 0 ? dos(cph / promedio) : null });
  });

  return { especialidad, promedio: dos(promedio), comparables: promedian.length,
           puestos, sinMedir, minOps: minOpsMedidas };
}

/**
 * Los tres rankings de una vez, a partir de filas ya clasificadas.
 *
 * Recibe las filas YA separadas por especialidad en vez de clasificarlas acá: la clasificación sale
 * del `origin` de Odoo y vive en `especialidad.ts`, con su propia prueba. Duplicarla sería tener
 * dos reglas que pueden separarse sin que nadie se entere.
 */
export function rankingPorEspecialidad<F extends FilaRankeable>(
  porEspecialidad: Readonly<Record<Especialidad, readonly F[]>>,
  minOpsMedidas: number | 'auto' = 0,
): RankingEspecialidad<F>[] {
  return (['seco', 'chocolates', 'congelados'] as const).map(e => {
    const filas = porEspecialidad[e] ?? [];
    // 'auto' se resuelve POR ESPECIALIDAD y no una vez para las tres: el más cargado de seco hace
    // 72 operaciones al mes y el de congelados 297. Un mínimo común saldría del más grande y
    // dejaría a seco sin nadie.
    const min = minOpsMedidas === 'auto' ? minOpsDelPeriodo(filas) : minOpsMedidas;
    return rankingDeEspecialidad(e, filas, min);
  });
}
