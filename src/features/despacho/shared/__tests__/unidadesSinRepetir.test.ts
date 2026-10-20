import { describe, it, expect } from 'vitest';
import { unidadesSinRepetir, avisoRepetidas, esMismaUnidad } from '../unidadesSinRepetir';

describe('unidadesSinRepetir', () => {
  it('deja pasar unidades distintas', () => {
    const filas = [
      { id: 'a', pickingSlotId: 1, savedItem: { id: 'i1', pickingSlotId: 1 } },
      { id: 'b', pickingSlotId: 2, savedItem: { id: 'i2', pickingSlotId: 2 } },
    ];
    expect(unidadesSinRepetir(filas)).toEqual({ unicas: filas, repetidas: 0 });
  });

  it('descarta la segunda tarjeta del mismo slot (60PBL: 11 donde había 6)', () => {
    const ch = [4.6, 7.3, 11, 13.9, 4.8, 10.7].map((_, k) => ({ id: `r${k}`, pickingSlotId: 3520 + k, savedItem: { id: `ch${k}`, pickingSlotId: 3520 + k } }));
    const gemelas = ch.slice(0, 5).map(f => ({ ...f, id: `g-${f.id}` }));
    const r = unidadesSinRepetir([...ch, ...gemelas]);
    expect(r.unicas.map(f => f.id)).toEqual(ch.map(f => f.id));
    expect(r.repetidas).toBe(5);
  });

  it('descarta la que trae el mismo ítem aunque apunte a otro slot', () => {
    const r = unidadesSinRepetir([
      { id: 'nueva', pickingSlotId: 3520, savedItem: { id: 'ch1', pickingSlotId: 3520 } },
      { id: 'vieja', pickingSlotId: 3463, savedItem: { id: 'ch1', pickingSlotId: 3463 } },
    ]);
    expect(r.unicas.map(f => f.id)).toEqual(['nueva']);
  });

  it('el slot sale del ítem guardado si la tarjeta no lo trae', () => {
    const r = unidadesSinRepetir([
      { id: 'a', savedItem: { id: 'x', pickingSlotId: 9 } },
      { id: 'b', pickingSlotId: 9 },
    ]);
    expect(r.repetidas).toBe(1);
  });

  it('tarjetas sin slot ni ítem no se juntan entre sí', () => {
    expect(unidadesSinRepetir([{ id: 'a' }, { id: 'b' }]).repetidas).toBe(0);
  });
});

describe('avisoRepetidas', () => {
  it('singular y plural', () => {
    expect(avisoRepetidas(1)).toBe('Una tarjeta estaba repetida y no se sumó dos veces');
    expect(avisoRepetidas(5)).toBe('5 tarjetas estaban repetidas y no se sumaron dos veces');
  });
});

describe('esMismaUnidad', () => {
  it('misma unidad si comparten slot, aunque una lo tenga solo en el ítem', () => {
    expect(esMismaUnidad({ id: 'a', pickingSlotId: 3520 }, { id: 'b', savedItem: { pickingSlotId: 3520 } })).toBe(true);
  });
  it('misma unidad si comparten ítem guardado', () => {
    expect(esMismaUnidad({ id: 'a', savedItem: { id: 'x' } }, { id: 'b', savedItem: { id: 'x' } })).toBe(true);
  });
  it('distintas si no comparten nada', () => {
    expect(esMismaUnidad({ id: 'a', pickingSlotId: 1 }, { id: 'b', pickingSlotId: 2 })).toBe(false);
  });
  it('dos tarjetas nuevas sin slot ni ítem no son la misma', () => {
    expect(esMismaUnidad({ id: 'a' }, { id: 'b' })).toBe(false);
  });
});
