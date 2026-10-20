import { describe, it, expect } from 'vitest';
import { slotsUnicos, agregarSlots } from '../slotsUnicos';

const s = (id: number, tipo = 'CH') => ({ id, tipo });

describe('slotsUnicos', () => {
  it('deja una entrada por id, la primera', () => {
    const a = { id: 1, tipo: 'CH', peso: 1 };
    const b = { id: 1, tipo: 'CH', peso: 2 };
    expect(slotsUnicos([a, s(2) as typeof a, b])).toEqual([a, s(2)]);
  });

  it('devuelve la misma lista si no hay repetidos', () => {
    const lista = [s(1), s(2)];
    expect(slotsUnicos(lista)).toBe(lista);
  });

  it('no toca los slots sin id', () => {
    expect(slotsUnicos([s(0, 'P'), s(0, 'B')])).toHaveLength(2);
  });
});

describe('agregarSlots', () => {
  it('60PBL: la recarga ya trajo CH1–CH5 y el revertir agrega los seis', () => {
    const recargados = [s(3481, 'P'), s(3520), s(3521), s(3522), s(3523), s(3524)];
    const nuevos = [s(3520), s(3521), s(3522), s(3523), s(3524), s(3525)];
    expect(agregarSlots(recargados, nuevos).map(x => x.id))
      .toEqual([3481, 3520, 3521, 3522, 3523, 3524, 3525]);
  });

  it('acepta una lista vacía o ausente', () => {
    expect(agregarSlots(undefined, [s(1)])).toEqual([s(1)]);
  });
});
