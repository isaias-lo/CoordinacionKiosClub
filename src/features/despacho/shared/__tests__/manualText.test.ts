import { describe, it, expect } from 'vitest';
import { partsOf, buildManualText, type ManualLine } from '../manualText';

describe('partsOf', () => {
  it('omite los conteos en cero', () => {
    expect(partsOf(2, 0, 0, 0)).toBe('2P');
    expect(partsOf(1, 1, 0, 0)).toBe('1P - 1B');
    expect(partsOf(0, 5, 0, 0)).toBe('5B');
    expect(partsOf(1, 2, 3, 4)).toBe('1P - 2B - 3C - 4CH');
    expect(partsOf(0, 0, 0, 0)).toBe('');
  });
});

describe('buildManualText', () => {
  const lines: ManualLine[] = [
    { cod: '53VAL', p: 2, b: 0, c: 0, ch: 0 },
    { cod: '47PTV', p: 1, b: 1, c: 0, ch: 0 },
    { cod: '00XXX', p: 0, b: 0, c: 0, ch: 0 }, // sin items → se ignora
  ];

  it('arma una línea por tienda con items y un TOTAL al final', () => {
    const { text, withItems, tot } = buildManualText(lines);
    expect(withItems).toHaveLength(2);
    expect(tot).toEqual({ p: 3, b: 1, c: 0, ch: 0 });
    expect(text).toBe('53VAL: 2P\n47PTV: 1P - 1B\n\nTOTAL: 3P - 1B - 2 TIENDAS');
  });

  it('devuelve texto vacío cuando no hay items', () => {
    const { text, withItems } = buildManualText([{ cod: 'A', p: 0, b: 0, c: 0, ch: 0 }]);
    expect(withItems).toHaveLength(0);
    expect(text).toBe('');
  });

  it('en el TOTAL los chocolates se suman como bultos (CH aparte solo en las líneas)', () => {
    const { text } = buildManualText([
      { cod: '24SPP', p: 1, b: 1, c: 0, ch: 0 },
      { cod: '27MCH', p: 1, b: 0, c: 0, ch: 1 },
    ]);
    // por línea: CH aparte
    expect(text).toContain('27MCH: 1P - 1CH');
    // en el total: 1B + 1CH = 2B
    expect(text).toContain('TOTAL: 2P - 2B - 2 TIENDAS');
  });

  it('en el TOTAL los contenedores quedan aparte; el CH se suma a B', () => {
    const { text, tot } = buildManualText([
      { cod: 'CC1', p: 0, b: 0, c: 2, ch: 0 },
      { cod: 'CH1', p: 0, b: 1, c: 0, ch: 3 },
    ]);
    expect(tot).toEqual({ p: 0, b: 1, c: 2, ch: 3 });
    expect(text).toContain('TOTAL: 4B - 2C - 2 TIENDAS');
  });

  it('usa singular "TIENDA" cuando hay una sola', () => {
    const { text } = buildManualText([{ cod: 'X', p: 1, b: 0, c: 0, ch: 0 }]);
    expect(text).toBe('X: 1P\n\nTOTAL: 1P - 1 TIENDA');
  });
});
