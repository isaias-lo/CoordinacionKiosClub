// «Filtros» de la lista de tiendas de Picking. Puro y testeable.

import type { PickingOperation, TodayStore } from './picking-types';
import { isPickeableState } from './picking-utils';

export type EstadoTienda = 'none' | 'partial' | 'complete';

/**
 * Cuántas operaciones lleva hechas la tienda. Solo cuentan las pickeables
 * (assigned/partially_available/done): un 'confirmed'/'waiting' sin stock (duplicado/backorder) no
 * debe restar completitud.
 */
export function estadoTienda(ops: PickingOperation[]): { estado: EstadoTienda; hechas: number; total: number } {
  const total = ops.filter(o => isPickeableState(o.state)).length;
  const hechas = ops.filter(o => o.state === 'done').length;
  return { estado: total === 0 ? 'none' : hechas === total ? 'complete' : 'partial', hechas, total };
}

export type FiltroTiendas = 'todas' | 'elegidas' | 'sin-elegir' | 'en-curso' | 'listas' | 'adelantos';

export const FILTROS: { key: FiltroTiendas; label: string }[] = [
  { key: 'todas',      label: 'Todas' },
  { key: 'elegidas',   label: 'Elegidas' },
  { key: 'sin-elegir', label: 'Sin elegir' },
  { key: 'en-curso',   label: 'En curso' },
  { key: 'listas',     label: 'Listas' },
  { key: 'adelantos',  label: 'Adelantos' },
];

export function pasaFiltro(
  f: FiltroTiendas, store: TodayStore, elegida: boolean, ops: PickingOperation[],
): boolean {
  switch (f) {
    case 'todas':      return true;
    case 'elegidas':   return elegida;
    case 'sin-elegir': return !elegida;
    case 'en-curso':   return estadoTienda(ops).estado === 'partial';
    case 'listas':     return estadoTienda(ops).estado === 'complete';
    case 'adelantos':  return !!store.adelanto;
  }
}
