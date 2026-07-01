import { describe, it, expect } from 'vitest';
import { sumPeso } from '../combineUtils';

describe('sumPeso — [P3] suma de pesos al combinar', () => {
  it('suma normal', () => {
    expect(sumPeso(10, 25)).toBe(35);
  });

  it('redondea a 2 decimales (evita drift de punto flotante)', () => {
    expect(sumPeso(0.1, 0.2)).toBe(0.3);
    expect(sumPeso(12.345, 1.005)).toBe(13.35);
  });

  it('trata NaN/undefined como 0', () => {
    expect(sumPeso(NaN, 5)).toBe(5);
    expect(sumPeso(5, NaN)).toBe(5);
    expect(sumPeso(0, 0)).toBe(0);
  });
});
