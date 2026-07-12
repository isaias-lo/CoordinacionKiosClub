import { describe, it, expect } from 'vitest';
import { unionRefs, slotQueSobrevive } from '../unifyPallets';
import { sumPeso } from '../combineUtils';

describe('unifyPallets — unionRefs', () => {
  it('une dos cadenas de guías deduplicando', () => {
    expect(unionRefs('A+B', 'B+C')).toBe('A+B+C');
  });

  it('conserva las guías del target cuando el source no tiene', () => {
    expect(unionRefs('G1+G2', '')).toBe('G1+G2');
    expect(unionRefs('G1+G2', null)).toBe('G1+G2');
  });

  it('toma las del source cuando el target está vacío', () => {
    expect(unionRefs('', 'G9')).toBe('G9');
    expect(unionRefs(undefined, 'G9')).toBe('G9');
  });

  it('limpia espacios y entradas vacías', () => {
    expect(unionRefs(' A + B ', '  +  C ')).toBe('A+B+C');
  });

  it('ambos vacíos → cadena vacía', () => {
    expect(unionRefs('', '')).toBe('');
    expect(unionRefs(null, undefined)).toBe('');
  });

  it('no duplica guías repetidas dentro de la misma cadena', () => {
    expect(unionRefs('A+A+B', 'B')).toBe('A+B');
  });
});

describe('unifyPallets — invariante del target', () => {
  it('el slot que sobrevive es SIEMPRE el del target', () => {
    expect(slotQueSobrevive(101, 202)).toBe(101);
    expect(slotQueSobrevive(5, 999)).toBe(5);
  });

  it('el peso combinado es la suma (P1 + P3) redondeada por sumPeso', () => {
    // sumPeso es la fuente de verdad de la suma; el merge usa exactamente esto.
    expect(sumPeso(120.5, 80.25)).toBe(sumPeso(80.25, 120.5)); // conmutativa
    expect(sumPeso(100, 0)).toBe(100); // source sin peso → target intacto
  });
});
