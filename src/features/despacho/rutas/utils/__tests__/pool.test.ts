import { describe, it, expect } from 'vitest';
import { tieneCarga, enElPool, codsEnPool, type EntradaPool } from '../pool';

const e = (d: Partial<EntradaPool>): EntradaPool => ({ on: true, p: 0, b: 0, c: 0, ch: 0, ...d });

describe('tieneCarga — los CUATRO tipos cuentan', () => {
  it('sin nada → false', () => {
    expect(tieneCarga({ p: 0, b: 0, c: 0, ch: 0 })).toBe(false);
    expect(tieneCarga({})).toBe(false);
    expect(tieneCarga(undefined)).toBe(false);
  });

  it('pallets o bultos → true', () => {
    expect(tieneCarga({ p: 1 })).toBe(true);
    expect(tieneCarga({ b: 1 })).toBe(true);
  });

  // Estos dos son los que se perdían: la tienda tiene carga real pero varias partes del
  // Enrutador la trataban como vacía.
  it('SOLO contenedores → true (ocupan piso como un pallet)', () => {
    expect(tieneCarga({ p: 0, b: 0, c: 2, ch: 0 })).toBe(true);
  });
  it('SOLO chocolates → true (31% de lo que sale de bodega)', () => {
    expect(tieneCarga({ p: 0, b: 0, c: 0, ch: 5 })).toBe(true);
  });

  it('campos ausentes se leen como 0, no rompen', () => {
    expect(tieneCarga({ p: undefined, ch: 3 })).toBe(true);
  });
});

describe('enElPool', () => {
  it('en el pool y con carga → participa', () => {
    expect(enElPool(e({ p: 2 }))).toBe(true);
  });
  it('en el pool pero vacía → no participa (tienda del calendario sin conteos aún)', () => {
    expect(enElPool(e({}))).toBe(false);
  });
  it('fuera del pool aunque tenga carga → no participa', () => {
    expect(enElPool(e({ on: false, p: 3 }))).toBe(false);
  });
  it('undefined → no participa', () => {
    expect(enElPool(undefined)).toBe(false);
  });
  it('una tienda de solo contenedores participa igual que una de pallets', () => {
    expect(enElPool(e({ c: 1 }))).toBe(true);
  });
});

describe('codsEnPool', () => {
  it('devuelve solo las que participan, ordenadas', () => {
    const calT = {
      '57CAS': e({ p: 1 }),
      '26ALC': e({ ch: 2 }),      // solo chocolates: cuenta
      '40LIL': e({ c: 1 }),       // solo contenedores: cuenta
      '02SCL': e({}),             // sin carga: no
      '05LP':  e({ on: false, p: 9 }), // fuera del pool: no
    };
    expect(codsEnPool(calT)).toEqual(['26ALC', '40LIL', '57CAS']);
  });

  it('pool vacío → lista vacía', () => {
    expect(codsEnPool({})).toEqual([]);
  });

  it('el orden es estable (sirve como firma para disparar la auto-asignación)', () => {
    const a = codsEnPool({ b: e({ p: 1 }), a: e({ p: 1 }) });
    const b = codsEnPool({ a: e({ p: 1 }), b: e({ p: 1 }) });
    expect(a.join(',')).toBe(b.join(','));
  });
});
