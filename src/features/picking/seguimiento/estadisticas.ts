// Estadísticas de pickers: períodos rápidos, totales y formatos. Módulo puro.

import type { PickerStatRow } from '../picking-types';

export type Periodo = 'hoy' | 'semana' | 'mes' | 'elegir';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fechas (YYYY-MM-DD, hora local) de un período rápido. La semana parte el lunes. */
export function rangoDe(periodo: Exclude<Periodo, 'elegir'>, ahora: Date): { desde: string; hasta: string } {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (periodo === 'hoy') return { desde: iso(hoy), hasta: iso(hoy) };
  if (periodo === 'semana') {
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return { desde: iso(lunes), hasta: iso(hoy) };
  }
  return {
    desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
  };
}

/** Qué período rápido corresponde a unas fechas, o 'elegir' si ninguno. */
export function periodoDe(desde: string, hasta: string, ahora: Date): Periodo {
  for (const p of ['hoy', 'semana', 'mes'] as const) {
    const r = rangoDe(p, ahora);
    if (r.desde === desde && r.hasta === hasta) return p;
  }
  return 'elegir';
}

export interface Totales {
  ops: number;
  sku: number;
  unidades: number;
  /** Minutos promedio por pedido, ponderado por operaciones. */
  minPorPedido: number;
  /** Segundos promedio por SKU, ponderado por SKU. */
  segPorSku: number;
  /** Unidades promedio por operación. */
  unidadesPorOp: number;
}

export function totales(rows: PickerStatRow[]): Totales {
  const ops = rows.reduce((s, r) => s + r.ops, 0);
  const sku = rows.reduce((s, r) => s + r.lineCount, 0);
  const unidades = rows.reduce((s, r) => s + r.units, 0);
  const minutos = rows.reduce((s, r) => s + r.avgMinutesPerOp * r.ops, 0);
  const segSku = rows.reduce((s, r) => s + r.avgSecondsPerLine * r.lineCount, 0);
  return {
    ops, sku, unidades,
    minPorPedido: ops ? minutos / ops : 0,
    segPorSku: sku ? segSku / sku : 0,
    unidadesPorOp: ops ? unidades / ops : 0,
  };
}

export function unidadesPorOp(r: PickerStatRow): number {
  return r.ops ? r.units / r.ops : 0;
}

/** «1.651» */
export function miles(n: number): string {
  return Math.round(n).toLocaleString('es-CL');
}

/** «19 min», «1 h 5 min»; «—» sin dato. */
export function textoMinutos(min: number): string {
  if (!(min > 0)) return '—';
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** «2,6 min» o «45 s»; «—» sin dato. */
export function textoSegundos(seg: number): string {
  if (!(seg > 0)) return '—';
  if (seg < 60) return `${Math.round(seg)} s`;
  return `${(seg / 60).toLocaleString('es-CL', { maximumFractionDigits: 1 })} min`;
}

/** «Del 1 al 31 oct», «9 oct», «Del 28 sep al 3 oct». */
export function textoRango(desde: string, hasta: string): string {
  const f = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const a = f(desde), b = f(hasta);
  const mes = (d: Date) => d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '');
  if (desde === hasta) return `${b.getDate()} ${mes(b)}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `Del ${a.getDate()} al ${b.getDate()} ${mes(b)}`;
  return `Del ${a.getDate()} ${mes(a)} al ${b.getDate()} ${mes(b)}`;
}
