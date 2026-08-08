import { describe, it, expect } from 'vitest';
import { remapPickingSlot } from '../remapPickingSlot';

describe('remapPickingSlot', () => {
  const items = [{ id: 'a', pickingSlotId: 10 }, { id: 'b', pickingSlotId: 20 }, { id: 'c' }];
  it('reasigna solo el item cuyo slot coincide con fromSlot', () => {
    const out = remapPickingSlot(items, 10, 99);
    expect(out).toEqual([{ id: 'a', pickingSlotId: 99 }, { id: 'b', pickingSlotId: 20 }, { id: 'c' }]);
  });
  it('no muta el array de entrada', () => {
    const snap = JSON.stringify(items);
    remapPickingSlot(items, 10, 99);
    expect(JSON.stringify(items)).toBe(snap);
  });
  it('fromSlot nulo → devuelve los items sin cambios', () => {
    expect(remapPickingSlot(items, undefined, 99)).toBe(items);
  });
  it('toSlot undefined (recreación falló) → deja el item sin slot', () => {
    expect(remapPickingSlot(items, 20, undefined)[1]).toEqual({ id: 'b', pickingSlotId: undefined });
  });
  it('si ningún item coincide, no cambia nada', () => {
    expect(remapPickingSlot(items, 777, 99)).toEqual(items);
  });
});
