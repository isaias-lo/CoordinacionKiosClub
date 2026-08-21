import { describe, it, expect } from 'vitest';
import { sumarPesoMultiple } from '../sumarMultiple';

describe('sumarPesoMultiple (sumar varios bultos/CH a un pallet)', () => {
  it('acumula el base + todos los pesos', () => {
    expect(sumarPesoMultiple(100, [20, 20, 20])).toBe(160); // pallet 100 + 3 CH de 20
    expect(sumarPesoMultiple(50, [10])).toBe(60);
  });
  it('base sin pesos = base', () => {
    expect(sumarPesoMultiple(80, [])).toBe(80);
    expect(sumarPesoMultiple(0, [])).toBe(0);
  });
  it('desde 0 suma todos', () => {
    expect(sumarPesoMultiple(0, [12.5, 7.5, 5])).toBe(25);
  });
  it('redondea por paso (sin drift de punto flotante)', () => {
    expect(sumarPesoMultiple(0, [0.1, 0.2])).toBe(0.3);   // 0.1+0.2 = 0.30000004 sin redondeo
    expect(sumarPesoMultiple(0.1, [0.2, 0.3])).toBe(0.6);
  });
  it('tolera base falsy', () => {
    expect(sumarPesoMultiple(NaN as unknown as number, [10, 5])).toBe(15);
  });
});
