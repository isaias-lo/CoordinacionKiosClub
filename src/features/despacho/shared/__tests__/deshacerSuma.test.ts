import { describe, it, expect } from 'vitest';
import { seqRestaurable, remapSlots, etiquetaSuma } from '../deshacerSuma';

const slot = (id: number, tipo: string, seq: number | null) => ({ id, tipo, seq });

describe('seqRestaurable', () => {
  it('el número está libre → se puede devolver', () => {
    // CH1, CH2 y CH4 siguen; el CH3 se había sumado. Nadie tiene el 3.
    const activos = [slot(10, 'CH', 1), slot(11, 'CH', 2), slot(13, 'CH', 4)];
    expect(seqRestaurable(3, 'CH', activos)).toBe(true);
  });

  it('si alguien tomó ese número mientras tanto, NO se devuelve — sería un CH3 duplicado', () => {
    // Se sumó el ÚLTIMO (CH3): el siguiente alta recibe max+1 = 3 otra vez.
    const activos = [slot(10, 'CH', 1), slot(11, 'CH', 2), slot(20, 'CH', 3)];
    expect(seqRestaurable(3, 'CH', activos)).toBe(false);
  });

  it('el mismo número en OTRO tipo no molesta: P3 y CH3 conviven', () => {
    expect(seqRestaurable(3, 'CH', [slot(10, 'P', 3)])).toBe(true);
  });

  it('ignora al slot recién creado para restaurar — es el que va a recibir el número', () => {
    // create-bodega le dio seq 5; se chequea antes de pisárselo por el 3.
    const activos = [slot(10, 'CH', 1), slot(99, 'CH', 5)];
    expect(seqRestaurable(3, 'CH', activos, 99)).toBe(true);
    // …pero si el nuevo ya vino con el 3, igual es suyo.
    expect(seqRestaurable(3, 'CH', [slot(99, 'CH', 3)], 99)).toBe(true);
  });

  it('sin número original no hay nada que restaurar', () => {
    expect(seqRestaurable(null, 'CH', [])).toBe(false);
    expect(seqRestaurable(undefined, 'CH', [])).toBe(false);
    expect(seqRestaurable(0, 'CH', [])).toBe(false);
    expect(seqRestaurable(2.5, 'CH', [])).toBe(false);
  });
});

describe('remapSlots', () => {
  it('reapunta VARIOS slots viejos a sus reemplazos', () => {
    const items = [
      { id: 'a', pickingSlotId: 1 }, { id: 'b', pickingSlotId: 2 }, { id: 'c', pickingSlotId: 3 },
    ];
    const out = remapSlots(items, new Map([[1, 101], [3, 103]]));
    expect(out.map(i => i.pickingSlotId)).toEqual([101, 2, 103]);
  });

  it('si no se pudo re-crear un slot, el item queda SIN slot — no apuntando a uno borrado', () => {
    // Apuntar al id viejo sería peor: ese slot ya no existe y el pallet quedaría "fantasma".
    const out = remapSlots([{ pickingSlotId: 1 }], new Map([[1, undefined]]));
    expect(out[0].pickingSlotId).toBeUndefined();
  });

  it('los items que no estaban en la suma no se tocan', () => {
    const items = [{ id: 'x', pickingSlotId: 7 }, { id: 'y' }];
    const out = remapSlots(items, new Map([[1, 101]]));
    expect(out).toEqual(items);
  });

  it('no muta la lista original', () => {
    const items = [{ pickingSlotId: 1 }];
    remapSlots(items, new Map([[1, 101]]));
    expect(items[0].pickingSlotId).toBe(1);
  });
});

describe('etiquetaSuma', () => {
  it('uno solo lo nombra', () => {
    expect(etiquetaSuma(['CH3'], 'P1')).toBe('CH3 sumado a P1');
  });

  it('hasta tres los nombra a todos', () => {
    expect(etiquetaSuma(['CH3', 'CH5'], 'P1')).toBe('CH3, CH5 sumados a P1');
    expect(etiquetaSuma(['B1', 'B2', 'CH4'], 'P2')).toBe('B1, B2, CH4 sumados a P2');
  });

  it('más de tres los cuenta — el snackbar es de una línea', () => {
    expect(etiquetaSuma(['B1', 'B2', 'B3', 'B4'], 'P1')).toBe('4 bultos sumados a P1');
  });
});
