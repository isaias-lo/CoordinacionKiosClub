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

// ── El aviso "quedó con asignaciones sin registrar" ────────────────────────
// Volvía TODOS los días aunque el día estuviera cerrado y registrado, porque preguntaba solo por
// 'rutas_reg' — un marcador que en el flujo real nadie escribe. Comprobado en la base: 20 filas
// seguidas de descarte a mano, y cero del cierre por camión en toda la historia de la tabla.
const fila = (fecha: string, fuente: string, state: unknown): SessionStateRow => ({ fecha, fuente, state });
const tablero = (camiones: Record<string, number>) =>
  Object.fromEntries(Object.entries(camiones).map(([p, n]) =>
    [p, Array.from({ length: n }, (_, i) => ({ c: `T${i}` }))]));

describe('computeUnregisteredDays', () => {
  it('un día con asignaciones y sin ninguna señal SÍ se avisa', () => {
    expect(computeUnregisteredDays([fila('2026-09-02', 'rutas', tablero({ 'AB-1': 2 }))]))
      .toEqual(['2026-09-02']);
  });

  it('"Terminar día" (fuente cierre) apaga el aviso', () => {
    const rows = [
      fila('2026-09-02', 'rutas', tablero({ 'AB-1': 2 })),
      fila('2026-09-02', 'cierre', { closedAt: '2026-09-03T11:47:45Z' }),
    ];
    expect(computeUnregisteredDays(rows)).toEqual([]);
  });

  it('el registro global o la ✕ manual también lo apagan', () => {
    const rows = [
      fila('2026-09-02', 'rutas', tablero({ 'AB-1': 2 })),
      fila('2026-09-02', 'rutas_reg', { at: '…', dismissed: true }),
    ];
    expect(computeUnregisteredDays(rows)).toEqual([]);
  });

  it('si TODOS los camiones con carga se cerraron uno por uno, el día está hecho', () => {
    const rows = [
      fila('2026-09-02', 'rutas', tablero({ 'AB-1': 2, 'CD-2': 1 })),
      fila('2026-09-02', 'rutas_cerradas', { patentes: ['AB-1', 'CD-2'] }),
    ];
    expect(computeUnregisteredDays(rows)).toEqual([]);
  });

  it('si falta cerrar un camión, el aviso se mantiene', () => {
    const rows = [
      fila('2026-09-02', 'rutas', tablero({ 'AB-1': 2, 'CD-2': 1 })),
      fila('2026-09-02', 'rutas_cerradas', { patentes: ['AB-1'] }),
    ];
    expect(computeUnregisteredDays(rows)).toEqual(['2026-09-02']);
  });

  it('las patentes se comparan normalizadas', () => {
    const rows = [
      fila('2026-09-02', 'rutas', tablero({ 'ab-1': 1 })),
      fila('2026-09-02', 'rutas_cerradas', { patentes: [' AB-1 '] }),
    ];
    expect(computeUnregisteredDays(rows)).toEqual([]);
  });

  it('un tablero con solo patentes vacías no genera aviso', () => {
    expect(computeUnregisteredDays([fila('2026-09-02', 'rutas', { 'AB-1': [], 'CD-2': [] })]))
      .toEqual([]);
  });

  it('varios días pendientes salen del más reciente al más antiguo', () => {
    const rows = [
      fila('2026-08-30', 'rutas', tablero({ 'AB-1': 1 })),
      fila('2026-09-02', 'rutas', tablero({ 'CD-2': 1 })),
    ];
    expect(computeUnregisteredDays(rows)).toEqual(['2026-09-02', '2026-08-30']);
  });
});
