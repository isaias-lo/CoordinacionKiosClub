import { describe, it, expect, vi } from 'vitest';

// El módulo inicializa el cliente browser de Supabase al importar; lo mockeamos para el test puro.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { flattenPendientesV2 } from '../userSessionState';

describe('flattenPendientesV2 — pool del tab 2ª VUELTA', () => {
  it('aplana filas de segunda_vuelta con su fecha origen', () => {
    const rows = [
      { fecha: '2026-07-01', state: { stores: [{ c: '39PSB', p: 3, b: 0, ch: 0 }, { c: '41ANA', p: 1, b: 0, ch: 0 }] } },
      { fecha: '2026-06-30', state: { stores: [{ c: '47PTV', p: 2, b: 0, ch: 0 }] } },
    ];
    const out = flattenPendientesV2(rows);
    expect(out).toHaveLength(3);
    expect(out.find(p => p.c === '39PSB')).toEqual({ c: '39PSB', p: 3, b: 0, ch: 0, fechaOrigen: '2026-07-01' });
    expect(out.find(p => p.c === '47PTV')?.fechaOrigen).toBe('2026-06-30');
  });

  it('ignora tiendas con counts en cero y estados vacíos', () => {
    const rows = [
      { fecha: '2026-07-01', state: { stores: [{ c: 'X', p: 0, b: 0, ch: 0 }] } },
      { fecha: '2026-07-01', state: {} },
      { fecha: '2026-07-01', state: null },
    ];
    expect(flattenPendientesV2(rows)).toEqual([]);
  });

  it('cuenta chocolates/bultos aunque no haya pallets', () => {
    const rows = [{ fecha: '2026-07-01', state: { stores: [{ c: 'Y', p: 0, b: 0, ch: 4 }] } }];
    expect(flattenPendientesV2(rows)).toEqual([{ c: 'Y', p: 0, b: 0, ch: 4, fechaOrigen: '2026-07-01' }]);
  });
});
