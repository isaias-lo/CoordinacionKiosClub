import { describe, it, expect } from 'vitest';
import { ESTADO_TO_SEGUIMIENTO, isoToFecha, syncSeguimientoDespacho } from '../seguimientoSync';

describe('isoToFecha', () => {
  it('convierte ISO YYYY-MM-DD → DD/MM/YYYY', () => {
    expect(isoToFecha('2026-07-30')).toBe('30/07/2026');
    expect(isoToFecha('2026-01-05')).toBe('05/01/2026');
  });
  it('tolera formatos no-ISO devolviendo el original', () => {
    expect(isoToFecha('30/07/2026')).toBe('30/07/2026');
    expect(isoToFecha('')).toBe('');
  });
});

describe('ESTADO_TO_SEGUIMIENTO', () => {
  it('mapea los estados de ruta al seguimiento del panel', () => {
    expect(ESTADO_TO_SEGUIMIENTO.pendiente).toBe('Pendiente');
    expect(ESTADO_TO_SEGUIMIENTO.en_camino).toBe('En camino');
    expect(ESTADO_TO_SEGUIMIENTO.entregado).toBe('Entregado');
    expect(ESTADO_TO_SEGUIMIENTO.recibido).toBe('Recibido');
  });
});

// Mock encadenable que registra la tabla y los filtros aplicados a cada .update().
function mockSb() {
  const calls: { tabla: string; filtros: Record<string, unknown>; set: unknown }[] = [];
  const sb = {
    from(tabla: string) {
      return {
        update(set: unknown) {
          const rec = { tabla, filtros: {} as Record<string, unknown>, set };
          calls.push(rec);
          const chain = {
            in(col: string, vals: unknown) { rec.filtros[`in:${col}`] = vals; return chain; },
            eq(col: string, val: unknown) { rec.filtros[`eq:${col}`] = val; return chain; },
          };
          return chain;
        },
      };
    },
  };
  return { sb, calls };
}

describe('syncSeguimientoDespacho', () => {
  it('no toca la BD si no hay cods', async () => {
    const { sb, calls } = mockSb();
    await syncSeguimientoDespacho(sb as never, '2026-07-30', [], 'Pendiente');
    expect(calls).toHaveLength(0);
  });

  it('actualiza despacho_rm y despacho_regiones con fecha DD/MM/YYYY y cods dedup', async () => {
    const { sb, calls } = mockSb();
    await syncSeguimientoDespacho(sb as never, '2026-07-30', ['02SCL', '02SCL', '07CCR'], 'Pendiente');
    expect(calls.map(c => c.tabla).sort()).toEqual(['despacho_regiones', 'despacho_rm']);
    for (const c of calls) {
      expect(c.set).toEqual({ seguimiento: 'Pendiente' });
      expect(c.filtros['eq:fecha']).toBe('30/07/2026');
      expect(c.filtros['in:cod']).toEqual(['02SCL', '07CCR']); // dedup
      expect(c.filtros['eq:seguimiento']).toBeUndefined();      // sin guard
    }
  });

  it('con soloDesdeRegistrado agrega el guard eq(seguimiento, Registrado)', async () => {
    const { sb, calls } = mockSb();
    await syncSeguimientoDespacho(sb as never, '2026-07-30', ['02SCL'], 'Pendiente', true);
    for (const c of calls) expect(c.filtros['eq:seguimiento']).toBe('Registrado');
  });
});
