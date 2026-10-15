import { describe, it, expect } from 'vitest';
import { asignarSlotSinGemelas } from '../asignarSlotSinGemelas';

describe('asignarSlotSinGemelas — una tarjeta por slot después de «+ Pallet»', () => {
  it('sin gemela: solo le pega el slot', () => {
    const out = asignarSlotSinGemelas([{ id: 'row-1' }, { id: 'x', pickingSlotId: 5 }], 'row-1', 9);
    expect(out).toEqual([{ id: 'row-1', pickingSlotId: 9 }, { id: 'x', pickingSlotId: 5 }]);
  });

  it('la recarga ya armó una tarjeta en blanco para el slot: se va esa', () => {
    const out = asignarSlotSinGemelas([{ id: 'row-1' }, { id: 'bk-pick-9', pickingSlotId: 9 }], 'row-1', 9);
    expect(out).toEqual([{ id: 'row-1', pickingSlotId: 9 }]);
  });

  it('alguien ya escribió en la gemela y la nuestra está en blanco: se va la nuestra', () => {
    const out = asignarSlotSinGemelas([{ id: 'row-1' }, { id: 'bk-pick-9', pickingSlotId: 9, tocada: true }], 'row-1', 9);
    expect(out).toEqual([{ id: 'bk-pick-9', pickingSlotId: 9, tocada: true }]);
  });

  it('la gemela ya está guardada: se va la nuestra', () => {
    const out = asignarSlotSinGemelas([{ id: 'row-1' }, { id: 'bk-saved-9', pickingSlotId: 9, saved: true }], 'row-1', 9);
    expect(out.map(f => f.id)).toEqual(['bk-saved-9']);
  });

  it('las dos tienen algo escrito: quedan las dos (elegir sería perder datos)', () => {
    const out = asignarSlotSinGemelas([{ id: 'row-1', tocada: true }, { id: 'bk-pick-9', pickingSlotId: 9, tocada: true }], 'row-1', 9);
    expect(out).toHaveLength(2);
  });

  it('la fila ya no está (se borró mientras esperaba): no cambia nada', () => {
    const filas = [{ id: 'bk-pick-9', pickingSlotId: 9 }];
    expect(asignarSlotSinGemelas(filas, 'row-1', 9)).toBe(filas);
  });
});
