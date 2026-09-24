import { describe, it, expect, vi, beforeEach } from 'vitest';

// El cliente supabase se mockea al nivel del import (igual que en eliminarSlotPicking.test.ts).
// Lo que se prueba acá no es la consulta: es que una UNIÓN deje las mismas marcas que un borrado.
const llamadas: { tabla: string; op: string; id?: number }[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: [{ id: 1, refs: 'A' }, { id: 2, refs: 'B' }], error: null }),
      }),
      update: () => ({
        eq: (_c: string, id: number) => { llamadas.push({ tabla, op: 'update', id }); return Promise.resolve({ error: null }); },
      }),
      delete: () => ({
        eq: (_c: string, id: number) => { llamadas.push({ tabla, op: 'delete', id }); return Promise.resolve({ error: null }); },
      }),
    }),
  },
}));

import { finalizarSlotUnion } from '../finalizarSlotUnion';
import { tieneLapida, llaveDeSlot, _limpiarLapidas } from '../lapidasBorrado';
import { fueRecienBorrado } from '../eliminarSlotPicking';

beforeEach(() => { llamadas.length = 0; _limpiarLapidas(); });

describe('finalizarSlotUnion — unir hace desaparecer una unidad, igual que borrarla', () => {
  it('la unidad absorbida queda con lápida', async () => {
    // Era el hueco: el arreglo de los borrados (#573) no cubría las uniones, así que el ítem
    // absorbido podía volver por el merge entre equipos exactamente igual que antes.
    expect(tieneLapida(llaveDeSlot(2))).toBe(false);
    const r = await finalizarSlotUnion(1, 2);
    expect(r.ok).toBe(true);
    expect(tieneLapida(llaveDeSlot(2))).toBe(true);
  });

  it('la que sobrevive NO queda con lápida', async () => {
    await finalizarSlotUnion(1, 2);
    expect(tieneLapida(llaveDeSlot(1))).toBe(false);
  });

  it('también pone el guard anti-revive (RC-3), que ya tenía', async () => {
    await finalizarSlotUnion(1, 2);
    expect(fueRecienBorrado(2)).toBe(true);
  });

  it('borra la absorbida, no la que sobrevive', async () => {
    await finalizarSlotUnion(1, 2);
    expect(llamadas.filter(l => l.op === 'delete')).toEqual([{ tabla: 'picking_pallets', op: 'delete', id: 2 }]);
  });

  it('con ids inválidos no marca nada ni borra nada', async () => {
    expect((await finalizarSlotUnion(0, 2)).ok).toBe(false);
    expect((await finalizarSlotUnion(1, 0)).ok).toBe(false);
    expect((await finalizarSlotUnion(3, 3)).ok).toBe(false);   // el mismo slot
    expect(llamadas.filter(l => l.op === 'delete')).toHaveLength(0);
    expect(tieneLapida(llaveDeSlot(2))).toBe(false);
  });
});
