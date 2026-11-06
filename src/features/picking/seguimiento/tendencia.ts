// ¿El rendimiento de cada persona sube o baja? Módulo puro: entran dos períodos, sale la
// comparación.
//
// ── QUÉ MÉTRICA MIDE «RENDIMIENTO» ────────────────────────────────────────────────────────────
//
// El **CPH**: unidades por hora. No es una elección de gusto — es la misma con la que la planilla
// «Abastecimiento por Olas» calcula el bono (`CPH_Real = unidades / tiempo`). Medir una cosa en
// pantalla y pagar por otra es la forma más rápida de que nadie crea en la pantalla.
//
// Las otras dos que se muestran —minutos por operación y segundos por línea— no sirven para
// comparar personas entre sí: dependen del tamaño de lo que le tocó. Van como contexto, no como
// el número que sube o baja.
//
// ── POR QUÉ HAY UN UMBRAL, Y POR QUÉ HAY UN MÍNIMO ────────────────────────────────────────────
//
// **Umbral.** Sin él, absolutamente nadie queda «igual»: un 0,4% de diferencia se dibujaría como
// una flecha hacia abajo y el tablero se llenaría de alarmas que no significan nada. Por defecto
// 5%: debajo de eso es ruido de cuántas tiendas grandes le tocaron a cada uno esa semana.
//
// **Mínimo de operaciones.** Comparar un período de 2 operaciones contra otro de 30 no mide a la
// persona, mide la muestra. Debajo del mínimo la fila sale como `sin-datos` y lo dice, en vez de
// mostrar un −60% que alguien va a leer como un problema de desempeño.
//
// Las dos reglas son configurables porque el valor correcto depende del período que se mire, pero
// tienen un valor por defecto para que nadie tenga que elegirlo para usar la pantalla.
//
// ── LOS PERÍODOS LOS ELIGE QUIEN LLAMA ────────────────────────────────────────────────────────
//
// Este módulo no sabe qué es «el período anterior»: recibe dos listas ya calculadas. La pantalla
// pide el mismo largo inmediatamente antes (siete días contra los siete previos). Comparar contra
// un período de otro largo compararía también el tamaño de la muestra.

import type { RendimientoPicker } from './rendimiento';

export type Direccion = 'sube' | 'baja' | 'igual' | 'nuevo' | 'sin-datos';

export interface Tendencia {
  nombre: string;
  /** Su fila en el período que se está mirando, o `null` si no trabajó. */
  actual: RendimientoPicker | null;
  /** Su fila en el período anterior, o `null` si no trabajó entonces. */
  previo: RendimientoPicker | null;
  /** Variación del CPH en por ciento. `null` cuando no se puede calcular. */
  deltaCph: number | null;
  direccion: Direccion;
  /** Por qué la dirección es `sin-datos`. Se muestra: un guion sin explicación no sirve. */
  motivo?: string;
}

export interface OpcionesTendencia {
  /** Variación en por ciento por debajo de la cual se considera que no cambió. */
  umbralPct?: number;
  /** Operaciones medidas mínimas en CADA período para poder comparar. */
  minimoOps?: number;
}

const UMBRAL_POR_DEFECTO = 5;
const MINIMO_POR_DEFECTO = 3;

/**
 * Compara dos períodos, persona por persona.
 *
 * Devuelve una fila por cada persona que aparece en CUALQUIERA de los dos: quien dejó de
 * trabajar también es información, y si solo se listaran los del período actual desaparecería
 * de la vista sin que nadie lo note.
 *
 * El orden es por volumen del período actual, de mayor a menor, y los que no trabajaron ahora
 * van al final. Alfabético pondría primero a quien hizo tres operaciones.
 */
export function compararPeriodos(
  actual: RendimientoPicker[],
  previo: RendimientoPicker[],
  opciones: OpcionesTendencia = {},
): Tendencia[] {
  const umbral = opciones.umbralPct ?? UMBRAL_POR_DEFECTO;
  const minimo = opciones.minimoOps ?? MINIMO_POR_DEFECTO;

  const porNombre = new Map<string, { a: RendimientoPicker | null; p: RendimientoPicker | null }>();
  for (const f of actual) porNombre.set(f.name, { a: f, p: null });
  for (const f of previo) {
    const e = porNombre.get(f.name);
    if (e) e.p = f; else porNombre.set(f.name, { a: null, p: f });
  }

  const filas: Tendencia[] = [];
  for (const [nombre, { a, p }] of porNombre) {
    filas.push({ nombre, actual: a, previo: p, ...direccionDe(a, p, umbral, minimo) });
  }

  return filas.sort((x, y) => (y.actual?.units ?? -1) - (x.actual?.units ?? -1)
    || x.nombre.localeCompare(y.nombre));
}

function direccionDe(
  a: RendimientoPicker | null, p: RendimientoPicker | null, umbral: number, minimo: number,
): { deltaCph: number | null; direccion: Direccion; motivo?: string } {
  if (!a) return { deltaCph: null, direccion: 'sin-datos', motivo: 'no trabajó en este período' };
  if (!p) return { deltaCph: null, direccion: 'nuevo', motivo: 'no trabajó en el período anterior' };

  // Pocas operaciones medidas: el número existiría pero mediría la muestra, no a la persona.
  if (a.opsMedidas < minimo || p.opsMedidas < minimo) {
    return { deltaCph: null, direccion: 'sin-datos',
             motivo: `muy pocas operaciones con hora (${p.opsMedidas} antes, ${a.opsMedidas} ahora)` };
  }
  // Un CPH de 0 como base haría una división por cero; y con 0 ahora, la caída es total pero el
  // porcentaje no significa nada.
  if (p.cph <= 0) {
    return { deltaCph: null, direccion: 'sin-datos', motivo: 'el período anterior no tiene ritmo medido' };
  }

  const delta = ((a.cph - p.cph) / p.cph) * 100;
  const redondeado = Math.round(delta * 10) / 10;
  if (Math.abs(redondeado) < umbral) return { deltaCph: redondeado, direccion: 'igual' };
  return { deltaCph: redondeado, direccion: redondeado > 0 ? 'sube' : 'baja' };
}

/** Cuántas personas hay en cada dirección, para el resumen de arriba. */
export function resumen(filas: Tendencia[]): Record<Direccion, number> {
  const r: Record<Direccion, number> = { sube: 0, baja: 0, igual: 0, nuevo: 0, 'sin-datos': 0 };
  for (const f of filas) r[f.direccion]++;
  return r;
}

/**
 * El período inmediatamente anterior, del MISMO largo.
 *
 * Siete días contra los siete previos. Comparar contra un período de otro largo compararía
 * también el tamaño de la muestra, no solo el ritmo.
 *
 * Las fechas son `YYYY-MM-DD` y los dos extremos entran. Se cuenta en UTC a propósito: son días
 * de calendario, no instantes, así que el huso no participa.
 */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const d = Date.parse(desde + 'T00:00:00Z');
  const h = Date.parse(hasta + 'T00:00:00Z');
  const UN_DIA = 86_400_000;
  const largo = Math.round((h - d) / UN_DIA) + 1;   // ambos extremos incluidos
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { desde: iso(d - largo * UN_DIA), hasta: iso(d - UN_DIA) };
}
