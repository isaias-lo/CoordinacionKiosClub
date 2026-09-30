import { describe, it, expect, vi, beforeEach } from 'vitest';

// El cliente supabase se mockea al nivel del import (igual que en eliminarSlotPicking.test.ts).
// Lo que se prueba acá no es la consulta: es que una UNIÓN deje las mismas marcas que un borrado.
const llamadas: { tabla: string; op: string; id?: number }[] = [];
// Qué slots devuelve la base. Se cambia por test para simular que otro equipo borró uno.
let slotsEnLaBase: { id: number; refs: string }[] = [{ id: 1, refs: 'A' }, { id: 2, refs: 'B' }];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => ({
      select: () => ({
        in: () => Promise.resolve({ data: slotsEnLaBase, error: null }),
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

beforeEach(() => {
  llamadas.length = 0; _limpiarLapidas();
  slotsEnLaBase = [{ id: 1, refs: 'A' }, { id: 2, refs: 'B' }];
});

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


// ── LO QUE DEJÓ A 12LAS SIN UNA SOLA UNIDAD (30/09/2026) ───────────────────────────────────────
//
//     17:17:11  Sebastián pesa el P1 (slot 549) en 377 kg
//     17:37:51  Isaías elimina el P2 (slot 550)
//     17:39:53  Sebastián une P1 con P2  →  destino 550, que ya no existe
//     17:39:54  se borra el slot 549  →  los 377 kg no quedan en ninguna parte
//
// La función leía los dos slots y no comprobaba que los dos volvieran: el `update` de refs no
// encontraba a nadie —y un update de cero filas no da error— y el borrado se ejecutaba igual.

describe('el destino ya no existe — otro equipo lo borró', () => {
  it('NO BORRA NADA: el peso vive en el absorbido y es lo único irreversible', async () => {
    slotsEnLaBase = [{ id: 549, refs: 'B' }];          // solo el absorbido; el destino se fue
    const r = await finalizarSlotUnion(550, 549);
    expect(r.ok).toBe(false);
    expect(llamadas.filter(l => l.op === 'delete')).toEqual([]);
  });

  it('tampoco escribe las refs: se sale ANTES de tocar la base', async () => {
    slotsEnLaBase = [{ id: 549, refs: 'B' }];
    await finalizarSlotUnion(550, 549);
    expect(llamadas).toEqual([]);
  });

  it('el motivo se puede mostrar, y dice qué hacer', async () => {
    slotsEnLaBase = [{ id: 549, refs: 'B' }];
    const r = await finalizarSlotUnion(550, 549);
    expect(r.error).toContain('destino');
    expect(r.error).toContain('Recarga');
    expect(r.sinCambios).toBe(true);
  });

  it('no pone lápida ni marca como borrado a una unidad que sigue viva', async () => {
    // Si las pusiera, el ítem desaparecería igual de la pantalla por el merge — el mismo daño
    // por otra puerta.
    slotsEnLaBase = [{ id: 549, refs: 'B' }];
    await finalizarSlotUnion(550, 549);
    expect(tieneLapida(llaveDeSlot(549))).toBe(false);
    expect(fueRecienBorrado(549)).toBe(false);
  });
});

describe('el absorbido ya no existe — la unión ya estaba hecha', () => {
  it('no es un error: repetir la operación da el mismo resultado', async () => {
    slotsEnLaBase = [{ id: 550, refs: 'A' }];
    const r = await finalizarSlotUnion(550, 549);
    expect(r).toMatchObject({ ok: true, sinCambios: true });
  });

  it('y no vuelve a borrar', async () => {
    slotsEnLaBase = [{ id: 550, refs: 'A' }];
    await finalizarSlotUnion(550, 549);
    expect(llamadas.filter(l => l.op === 'delete')).toEqual([]);
  });
});

describe('los dos existen — el camino normal sigue igual', () => {
  it('fusiona las refs y borra el absorbido', async () => {
    const r = await finalizarSlotUnion(1, 2);
    expect(r.ok).toBe(true);
    expect(llamadas.some(l => l.op === 'update' && l.id === 1)).toBe(true);
    expect(llamadas.some(l => l.op === 'delete' && l.id === 2)).toBe(true);
  });
});
