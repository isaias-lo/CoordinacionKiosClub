import { describe, it, expect } from 'vitest';
import { partsOf, buildManualText, lineaTotal, type ManualLine, filasParaManual, esFilaCongelados } from '../manualText';

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

describe('lineaTotal', () => {
  it('suma los chocolates como bultos', () => {
    expect(lineaTotal({ p: 5, b: 2, c: 0, ch: 3 }, 4)).toBe('TOTAL: 5P - 5B - 4 TIENDAS');
  });

  it('una sola tienda va en singular', () => {
    expect(lineaTotal({ p: 1, b: 0, c: 0, ch: 0 }, 1)).toBe('TOTAL: 1P - 1 TIENDA');
  });

  it('es exactamente la última línea de buildManualText — no se pueden desalinear', () => {
    const lines = [{ cod: '01A', p: 2, b: 1, c: 0, ch: 0 }];
    const { text, tot, withItems } = buildManualText(lines);
    expect(text.split('\n').at(-1)).toBe(lineaTotal(tot, withItems.length));
  });
});

describe('filasParaManual — congelados no se suma al seco', () => {
  // El 15/09 real: tiendas con fila seca Y fila de congelados. El Map del Manual está indexado por
  // código, así que sin filtrar una pisaba a la otra — y ganaba la que viniera última.
  const FILAS = [
    { fuente: 'santiago',            tienda_cod: '01TPS', pallets: 5, bultos: 2 },
    { fuente: 'congelados-santiago', tienda_cod: '01TPS', pallets: 0, bultos: 0 },
    { fuente: 'regiones',            tienda_cod: '41ANA', pallets: 3, bultos: 1 },
    { fuente: 'congelados-regiones', tienda_cod: '60PBL', pallets: 0, bultos: 4 },
  ];

  it('deja fuera las de congelados', () => {
    expect(filasParaManual(FILAS).map(f => f.fuente)).toEqual(['santiago', 'regiones']);
  });

  it('01TPS conserva sus 5 pallets: la fila de congelados ya no la pisa', () => {
    const r = filasParaManual(FILAS).filter(f => f.tienda_cod === '01TPS');
    expect(r).toHaveLength(1);
    expect(r[0].pallets).toBe(5);
  });

  it('una tienda que SOLO tiene congelados no aparece en el Manual seco', () => {
    expect(filasParaManual(FILAS).some(f => f.tienda_cod === '60PBL')).toBe(false);
  });

  it('no toca las filas de seco ni las de regiones', () => {
    expect(filasParaManual([{ fuente: 'santiago' }, { fuente: 'regiones' }])).toHaveLength(2);
  });

  it('una fuente vacía o nula NO se descarta: ante la duda, se muestra', () => {
    expect(filasParaManual([{ fuente: '' }, { fuente: null }, {}])).toHaveLength(3);
  });
});

describe('esFilaCongelados', () => {
  it('reconoce las dos fuentes de congelados', () => {
    expect(esFilaCongelados({ fuente: 'congelados-santiago' })).toBe(true);
    expect(esFilaCongelados({ fuente: 'congelados-regiones' })).toBe(true);
  });

  it('y no confunde las de seco', () => {
    for (const f of ['santiago', 'regiones', 'bodega_rm', '', null, undefined]) {
      expect(esFilaCongelados({ fuente: f })).toBe(false);
    }
  });
});
