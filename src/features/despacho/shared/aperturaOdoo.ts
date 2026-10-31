// Los movimientos de APERTURA de una tienda, agrupados por el día en que Abastecimiento los dejó.
// PURO.
//
// ── QUÉ ES UNA APERTURA Y POR QUÉ NO ENCAJA ───────────────────────────────────────────────────
//
// Una tienda que abre recibe su primera carga días antes de existir en el calendario. Abastecimiento
// la sube con la fecha en que la preparó, no con la del día en que Bodega la va a armar: 62PLD se
// armó el sábado 31 con movimientos del viernes 30, y 63CAL tuvo tres lotes entre el 27 y el 28.
//
// Para el resto de la operación el día de Odoo y el día de Bodega son el mismo, y por eso la
// consulta pide uno solo. Acá no, y de ahí sale todo lo demás.
//
// ── LAS DOS REGLAS QUE NO SE NEGOCIAN ─────────────────────────────────────────────────────────
//
// 1. **Un día, nunca un rango.** 63CAL lo prueba: tiene movimientos del 27 y del 28, y parte de
//    ellos ya procesados. Un rango los juntaría en una sola lista y nadie podría distinguir cuál
//    lote está pendiente. Por eso esto AGRUPA en vez de sumar: devuelve los días por separado y
//    quien decide elige uno.
//
// 2. **Solo lo Preparado.** Lo procesado y lo cancelado no entra, y ese filtro vive en la consulta
//    a Odoo, no acá. Lo que llega a esta función ya pasó por él.
//
// Y hay un tercer motivo para no mirar «todo lo pendiente de días anteriores» sin más: el 31/10
// había 17 movimientos NORMALES rezagados, de quince tiendas del calendario. Son residuos que
// nunca se prepararon, y aparecerían mezclados con la apertura si el filtro fuera solo la fecha.

/** La categoría que Abastecimiento le pone al movimiento. */
export const CATEGORIAS_ABASTECIMIENTO = ['Comida', 'Aseo', 'Hogar', 'Chocolates', 'Congelados'] as const;

/**
 * ¿Este movimiento es de una apertura?
 *
 * Por el texto que escribe Abastecimiento, que es el único lugar donde esa condición existe: Odoo
 * no tiene un campo para decirlo. Si algún día cambian la palabra, esto deja de encontrarlos — y
 * por eso la pantalla conserva SIEMPRE la opción de elegir el día a mano.
 */
export function esApertura(origin: string | null | undefined): boolean {
  return /apertura/i.test(String(origin ?? ''));
}

/**
 * La categoría de un movimiento, sea de apertura o no.
 *
 * Existe porque el mapa de Picking busca `'Abastecimiento Comida'` con las dos palabras PEGADAS, y
 * una apertura dice `'Abastecimiento Apertura Comida'`: con «Apertura» en medio no coincidía
 * ninguna, así que los 16 movimientos de 62PLD salían sin categoría.
 */
export function categoriaDeOrigin(origin: string | null | undefined): string | null {
  const m = /Abastecimiento\s+(?:Apertura\s+)?(Comida|Aseo|Hogar|Chocolates?|Congelados)/i
    .exec(String(origin ?? ''));
  if (!m) return null;
  const cruda = m[1].toLowerCase();
  if (cruda.startsWith('chocolate')) return 'Chocolates';
  return cruda.charAt(0).toUpperCase() + cruda.slice(1);
}

/** Un movimiento de Odoo con su día de Chile ya resuelto. */
export interface MovimientoApertura {
  /** La referencia de Odoo, p. ej. `99REC/DT/145375`. */
  ref: string;
  origin: string;
  /** El día de Chile del `scheduled_date`, en `YYYY-MM-DD`. */
  dia: string;
}

/** Lo que hay preparado en UN día, listo para mostrarse. */
export interface DiaDeApertura {
  dia: string;
  total: number;
  /** Las categorías con su cuenta, de mayor a menor. Para el desglose del aviso. */
  porCategoria: { categoria: string; n: number }[];
  refs: string[];
}

/**
 * Los días que tienen movimientos de apertura preparados, del más reciente al más viejo.
 *
 * Devolver una LISTA y no un total es la regla 1 hecha código: quien llama elige un día, y los
 * demás quedan a la vista por si hace falta otro. Nunca se suman entre sí.
 */
export function agruparAperturas(movs: readonly MovimientoApertura[]): DiaDeApertura[] {
  const porDia = new Map<string, MovimientoApertura[]>();
  for (const m of movs) {
    const dia = String(m?.dia ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) continue;
    porDia.set(dia, [...(porDia.get(dia) ?? []), m]);
  }

  const out: DiaDeApertura[] = [];
  for (const [dia, lista] of porDia) {
    const cuenta = new Map<string, number>();
    for (const m of lista) {
      const cat = categoriaDeOrigin(m.origin) ?? 'Otros';
      cuenta.set(cat, (cuenta.get(cat) ?? 0) + 1);
    }
    out.push({
      dia,
      total: lista.length,
      // Mayor primero; a igual cuenta, el orden en que Abastecimiento nombra las categorías, para
      // que dos días con la misma carga se lean igual y no bailen entre una consulta y otra.
      porCategoria: [...cuenta.entries()]
        .map(([categoria, n]) => ({ categoria, n }))
        .sort((a, b) => b.n - a.n || orden(a.categoria) - orden(b.categoria)),
      refs: lista.map(m => m.ref),
    });
  }
  return out.sort((a, b) => b.dia.localeCompare(a.dia));
}

function orden(cat: string): number {
  const i = (CATEGORIAS_ABASTECIMIENTO as readonly string[]).indexOf(cat);
  return i === -1 ? CATEGORIAS_ABASTECIMIENTO.length : i;
}

/**
 * El día que la pantalla propone: el MÁS RECIENTE con movimientos preparados.
 *
 * El más reciente y no el que más tiene: si Abastecimiento volvió a cargar, la segunda carga es la
 * que vale — es lo que pasó con 63CAL, cuyo lote del 28 reemplaza al del 27.
 */
export function diaPropuesto(dias: readonly DiaDeApertura[]): DiaDeApertura | null {
  return dias.length ? dias[0] : null;
}

/** «7 Comida · 5 Hogar · 2 Aseo · 2 Chocolates», para el aviso. */
export function desgloseEnPalabras(dia: DiaDeApertura | null | undefined): string {
  if (!dia?.porCategoria?.length) return '';
  return dia.porCategoria.map(c => `${c.n} ${c.categoria}`).join(' · ');
}
