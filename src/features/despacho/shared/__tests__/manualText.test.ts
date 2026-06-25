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
    expect(text).toBe('53VAL: 2P\n47PTV: 1P - 1B\n\nTOTAL: 3P - 1B');
  });

  it('devuelve texto vacío cuando no hay items', () => {
    const { text, withItems } = buildManualText([{ cod: 'A', p: 0, b: 0, c: 0, ch: 0 }]);
    expect(withItems).toHaveLength(0);
    expect(text).toBe('');
  });

  it('incluye contenedores y chocolates en el total', () => {
    const { text, tot } = buildManualText([
      { cod: 'CC1', p: 0, b: 0, c: 2, ch: 0 },
      { cod: 'CH1', p: 0, b: 0, c: 0, ch: 3 },
    ]);
    expect(tot).toEqual({ p: 0, b: 0, c: 2, ch: 3 });
    expect(text).toContain('TOTAL: 2C - 3CH');
  });
});
