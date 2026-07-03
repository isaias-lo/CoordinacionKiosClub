import { describe, it, expect } from 'vitest';
import { pickFaltantesIdx, faltanteId } from '../registroFaltantes';

describe('pickFaltantesIdx', () => {
  it('devuelve las que NO existen aún', () => {
    const records = [
      { fecha: '02/07/2026', cod: '05LP' },   // existe
      { fecha: '02/07/2026', cod: '56PZA' },  // falta
      { fecha: '02/07/2026', cod: '21NUC' },  // existe
    ];
    const existing = new Set(['02/07/2026::05LP', '02/07/2026::21NUC']);
    expect(pickFaltantesIdx(records, existing)).toEqual([1]);
  });

  it('deduplica dentro del lote (misma fecha::cod repetida)', () => {
    const records = [
      { fecha: '02/07/2026', cod: '56PZA' },
      { fecha: '02/07/2026', cod: '56PZA' },
    ];
    expect(pickFaltantesIdx(records, new Set())).toEqual([0]);
  });

  it('descarta records sin fecha o sin cod', () => {
    const records = [
      { fecha: '02/07/2026', cod: '' },
      { fecha: null, cod: '56PZA' },
      { cod: '56PZA' },
      { fecha: '02/07/2026', cod: '56PZA' },
    ];
    expect(pickFaltantesIdx(records, new Set())).toEqual([3]);
  });

  it('lista vacía si todas existen', () => {
    const records = [{ fecha: '02/07/2026', cod: '05LP' }];
    expect(pickFaltantesIdx(records, new Set(['02/07/2026::05LP']))).toEqual([]);
  });

  it('distingue por fecha (mismo cod, otra fecha)', () => {
    const records = [{ fecha: '03/07/2026', cod: '56PZA' }];
    expect(pickFaltantesIdx(records, new Set(['02/07/2026::56PZA']))).toEqual([0]);
  });
});

describe('faltanteId', () => {
  it('id determinista por fecha+cod (sin slashes)', () => {
    expect(faltanteId('02/07/2026', '56PZA')).toBe('ENR-02072026-56PZA');
  });
  it('mismo input → mismo id (idempotente)', () => {
    expect(faltanteId('02/07/2026', '56PZA')).toBe(faltanteId('02/07/2026', '56PZA'));
  });
});
