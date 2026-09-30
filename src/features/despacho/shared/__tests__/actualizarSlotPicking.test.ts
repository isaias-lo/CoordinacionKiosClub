import { describe, it, expect, vi, beforeEach } from 'vitest';

// Qué devuelve el update: `data` son las filas AFECTADAS (por el `.select('id')`).
let respuesta: { data: { id: number }[] | null; error: { message: string } | null } =
  { data: [{ id: 549 }], error: null };
const updates: { id: number; campos: Record<string, unknown> }[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (campos: Record<string, unknown>) => ({
        eq: (_c: string, id: number) => ({
          select: () => { updates.push({ id, campos }); return Promise.resolve(respuesta); },
        }),
      }),
    }),
  },
}));

import { actualizarSlotPicking, AVISO_SLOT_BORRADO } from '../actualizarSlotPicking';

beforeEach(() => {
  updates.length = 0;
  respuesta = { data: [{ id: 549 }], error: null };
});

// ── LO QUE PASÓ EN 12LAS EL 30/09/2026 ─────────────────────────────────────────────────────────
//
//     16:44:06  Sebastián suma el CH1 al pallet  →  el slot 605 se BORRA
//     16:48:35  Isaías registra «CH1 · 11,9 kg»  →  al slot 605, que ya no existe
//
// La pantalla dijo «✓ agregado» las dos veces. Un update de cero filas NO da error.

describe('actualizarSlotPicking — un update de cero filas no es un éxito', () => {
  it('EL CASO: el slot ya no existe → lo dice, y no se confunde con un error de la base', async () => {
    respuesta = { data: [], error: null };
    const r = await actualizarSlotPicking(605, { peso_kg: 11.9 });
    expect(r).toEqual({ ok: false, yaNoExiste: true });
  });

  it('el slot existe: se actualizó de verdad', async () => {
    const r = await actualizarSlotPicking(549, { peso_kg: 377 });
    expect(r).toEqual({ ok: true, yaNoExiste: false });
    expect(updates).toEqual([{ id: 549, campos: { peso_kg: 377 } }]);
  });

  it('un error REAL de la base no se lee como «ya no existe»', async () => {
    // Son cosas distintas y llevan avisos distintos: una se arregla recargando, la otra no.
    respuesta = { data: null, error: { message: 'connection reset' } };
    const r = await actualizarSlotPicking(549, { peso_kg: 1 });
    expect(r.yaNoExiste).toBe(false);
    expect(r.error).toBe('connection reset');
  });

  it('`data` en null tampoco se lee como borrado', async () => {
    respuesta = { data: null, error: null };
    const r = await actualizarSlotPicking(549, { peso_kg: 1 });
    expect(r.yaNoExiste).toBe(true);   // cero filas afectadas
    expect(r.ok).toBe(false);
  });

  it('sin slot es un no-op seguro: no se pidió escribir en ninguna unidad', async () => {
    for (const id of [undefined, null, 0]) {
      const r = await actualizarSlotPicking(id, { peso_kg: 1 });
      expect(r, String(id)).toEqual({ ok: false, yaNoExiste: false });
    }
    expect(updates).toEqual([]);
  });

  it('el aviso dice lo único que arregla la situación', () => {
    expect(AVISO_SLOT_BORRADO).toContain('Recarga la tienda');
  });
});
