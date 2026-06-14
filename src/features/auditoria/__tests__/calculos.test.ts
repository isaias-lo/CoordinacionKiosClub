import { describe, it, expect } from 'vitest';
import { calcAuditado } from '../utils/calculos';

describe('calcAuditado', () => {
  it('resta del esperado cuando hay faltante', () => {
    expect(calcAuditado(3, 'faltante', 10)).toBe(7);
  });

  it('suma al esperado cuando hay sobrante', () => {
    expect(calcAuditado(3, 'sobrante', 10)).toBe(13);
  });

  it('sin diferencia (0 unidades) devuelve lo esperado', () => {
    expect(calcAuditado(0, 'faltante', 10)).toBe(10);
    expect(calcAuditado(0, 'sobrante', 10)).toBe(10);
  });

  it('un faltante mayor al esperado puede dar negativo', () => {
    expect(calcAuditado(12, 'faltante', 10)).toBe(-2);
  });
});
