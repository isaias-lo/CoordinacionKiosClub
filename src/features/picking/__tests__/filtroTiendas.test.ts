import { describe, it, expect } from 'vitest';
import { estadoTienda, pasaFiltro } from '../filtroTiendas';
import type { PickingOperation, TodayStore } from '../picking-types';

const op = (state: string) => ({ state }) as unknown as PickingOperation;
const tienda = (adelanto = false) =>
  ({ cod: '18FLO', name: 'Florida', sources: [], ...(adelanto ? { adelanto: { id: 1, zona: 'rm', fecha_despacho: null } } : {}) }) as TodayStore;

describe('estadoTienda', () => {
  it('sin operaciones', () => expect(estadoTienda([]).estado).toBe('none'));
  it('en curso y lista', () => {
    expect(estadoTienda([op('done'), op('assigned')])).toEqual({ estado: 'partial', hechas: 1, total: 2 });
    expect(estadoTienda([op('done')]).estado).toBe('complete');
  });
  it('lo que no es pickeable no resta', () => {
    expect(estadoTienda([op('done'), op('confirmed')]).estado).toBe('complete');
  });
});

describe('pasaFiltro', () => {
  it('elegidas y sin elegir', () => {
    expect(pasaFiltro('elegidas', tienda(), true, [])).toBe(true);
    expect(pasaFiltro('elegidas', tienda(), false, [])).toBe(false);
    expect(pasaFiltro('sin-elegir', tienda(), false, [])).toBe(true);
  });
  it('por estado', () => {
    expect(pasaFiltro('en-curso', tienda(), true, [op('done'), op('assigned')])).toBe(true);
    expect(pasaFiltro('listas', tienda(), true, [op('done'), op('assigned')])).toBe(false);
    expect(pasaFiltro('listas', tienda(), true, [op('done')])).toBe(true);
  });
  it('adelantos', () => {
    expect(pasaFiltro('adelantos', tienda(true), false, [])).toBe(true);
    expect(pasaFiltro('adelantos', tienda(false), false, [])).toBe(false);
  });
  it('todas deja pasar todo', () => expect(pasaFiltro('todas', tienda(), false, [])).toBe(true));
});
