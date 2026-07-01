import { describe, it, expect, vi } from 'vitest';

// El módulo inicializa el cliente browser de Supabase al importar; lo mockeamos para el test puro.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { computeUnregisteredDays, type SessionStateRow } from '../userSessionState';

const asign = (plate: string, stores: number) =>
  ({ [plate]: Array.from({ length: stores }, (_, i) => ({ c: `T${i}`, p: 1, b: 0, ch: 0 })) });

describe('computeUnregisteredDays — aviso de días sin registrar en el Enrutador', () => {
  it('marca un día con asignaciones y sin registro', () => {
    const rows: SessionStateRow[] = [
      { fecha: '2026-06-30', fuente: 'rutas', state: asign('SPJP88', 3) },
    ];
    expect(computeUnregisteredDays(rows)).toEqual(['2026-06-30']);
  });

  it('NO marca un día que sí tiene registro (rutas_reg)', () => {
    const rows: SessionStateRow[] = [
      { fecha: '2026-06-30', fuente: 'rutas', state: asign('SPJP88', 3) },
      { fecha: '2026-06-30', fuente: 'rutas_reg', state: { at: 'x' } },
    ];
    expect(computeUnregisteredDays(rows)).toEqual([]);
  });

  it('NO marca un día cuyas asignaciones están vacías', () => {
    const rows: SessionStateRow[] = [
      { fecha: '2026-06-29', fuente: 'rutas', state: {} },
      { fecha: '2026-06-28', fuente: 'rutas', state: { SPJP88: [] } },
    ];
    expect(computeUnregisteredDays(rows)).toEqual([]);
  });

  it('devuelve varios días, más reciente primero', () => {
    const rows: SessionStateRow[] = [
      { fecha: '2026-06-28', fuente: 'rutas', state: asign('A', 1) },
      { fecha: '2026-06-30', fuente: 'rutas', state: asign('B', 2) },
      { fecha: '2026-06-29', fuente: 'rutas', state: asign('C', 1) },
      { fecha: '2026-06-29', fuente: 'rutas_reg', state: { at: 'x' } }, // registrado → excluido
    ];
    expect(computeUnregisteredDays(rows)).toEqual(['2026-06-30', '2026-06-28']);
  });
});
