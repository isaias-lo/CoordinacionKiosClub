import { describe, it, expect } from 'vitest';
import { prioridadTipoCard, ordenarCardsPorTipo } from '../ordenCards';

describe('prioridadTipoCard', () => {
  it('ordena Pallet → Contenedor → Bulto → Chocolate (ambos nombres)', () => {
    expect(prioridadTipoCard('Pallet')).toBeLessThan(prioridadTipoCard('Contenedor'));
    expect(prioridadTipoCard('Contenedor')).toBeLessThan(prioridadTipoCard('Bulto'));
    expect(prioridadTipoCard('Bulto')).toBeLessThan(prioridadTipoCard('Chocolate'));
    // Regiones (minúsculas / box)
    expect(prioridadTipoCard('pallet')).toBeLessThan(prioridadTipoCard('contenedor'));
    expect(prioridadTipoCard('contenedor')).toBeLessThan(prioridadTipoCard('box'));
    expect(prioridadTipoCard('box')).toBeLessThan(prioridadTipoCard('chocolate'));
  });
  it('tipos desconocidos van al final', () => {
    expect(prioridadTipoCard('xyz')).toBe(99);
  });
});

describe('ordenarCardsPorTipo', () => {
  const kind = (r: { t: string }) => r.t;

  it('reordena intercalado → P, C, B, CH', () => {
    const rows = [{ t: 'Pallet' }, { t: 'Bulto' }, { t: 'Chocolate' }, { t: 'Contenedor' }, { t: 'Bulto' }];
    expect(ordenarCardsPorTipo(rows, kind).map(r => r.t)).toEqual(
      ['Pallet', 'Contenedor', 'Bulto', 'Bulto', 'Chocolate'],
    );
  });

  it('es ESTABLE: mantiene el orden de llegada dentro de cada tipo', () => {
    const rows = [{ t: 'Bulto', n: 1 }, { t: 'Pallet', n: 1 }, { t: 'Bulto', n: 2 }, { t: 'Pallet', n: 2 }];
    const out = ordenarCardsPorTipo(rows, r => r.t);
    expect(out.filter(r => r.t === 'Pallet').map(r => r.n)).toEqual([1, 2]);
    expect(out.filter(r => r.t === 'Bulto').map(r => r.n)).toEqual([1, 2]);
  });
});
