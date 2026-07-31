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

type Row = { cod: string; fecha: string; seguimiento: string; created_at: string };

/**
 * Mock del cliente Supabase: `select().in()` devuelve candidatos por tabla; `update().eq()…`
 * registra la actualización (tabla + filtros + set).
 */
function mockSb(candidatos: { despacho_rm?: Row[]; despacho_regiones?: Row[] }) {
  const updates: { tabla: string; filtros: Record<string, unknown>; set: unknown }[] = [];
  const sb = {
    from(tabla: string) {
      return {
        select() {
          return { in: (_col: string, _vals: unknown) => Promise.resolve({ data: candidatos[tabla as keyof typeof candidatos] ?? [] }) };
        },
        update(set: unknown) {
          const rec = { tabla, filtros: {} as Record<string, unknown>, set };
          const chain = {
            eq(col: string, val: unknown) { rec.filtros[`eq:${col}`] = val; return chain; },
            then(res: (v: { data: null }) => void) { updates.push(rec); res({ data: null }); },
          };
          return chain;
        },
      };
    },
  };
  return { sb, updates };
}

describe('syncSeguimientoDespacho', () => {
  it('no toca la BD si no hay cods', async () => {
    const { sb, updates } = mockSb({});
    await syncSeguimientoDespacho(sb as never, [], 'Pendiente');
    expect(updates).toHaveLength(0);
  });

  it('resuelve la fecha del despacho ARMADO por tienda (no la del manifiesto) y avanza Registrado', async () => {
    // 49PTA armado el 29/07 (aunque el manifiesto salga otro día) → debe actualizar 29/07, no otra.
    const rm: Row[] = [
      { cod: '49PTA', fecha: '28/07/2026', seguimiento: 'Registrado', created_at: '2026-07-28T10:00:00Z' },
      { cod: '49PTA', fecha: '29/07/2026', seguimiento: 'Registrado', created_at: '2026-07-29T10:00:00Z' },
    ];
    const { sb, updates } = mockSb({ despacho_rm: rm, despacho_regiones: [] });
    await syncSeguimientoDespacho(sb as never, ['49PTA'], 'Pendiente', true);
    const rmUpd = updates.find(u => u.tabla === 'despacho_rm');
    expect(rmUpd?.set).toEqual({ seguimiento: 'Pendiente' });
    expect(rmUpd?.filtros['eq:cod']).toBe('49PTA');
    expect(rmUpd?.filtros['eq:fecha']).toBe('29/07/2026');           // la más reciente activa
    expect(rmUpd?.filtros['eq:seguimiento']).toBe('Registrado');     // guard soloDesdeRegistrado
    // actualiza ambas tablas
    expect(updates.map(u => u.tabla).sort()).toEqual(['despacho_regiones', 'despacho_rm']);
  });

  it('sin soloDesdeRegistrado no agrega el guard (cambio de estado explícito)', async () => {
    const rm: Row[] = [{ cod: 'OFIKC', fecha: '30/07/2026', seguimiento: 'Registrado', created_at: '2026-07-30T10:00:00Z' }];
    const { sb, updates } = mockSb({ despacho_rm: rm });
    await syncSeguimientoDespacho(sb as never, ['OFIKC'], 'En camino');
    const rmUpd = updates.find(u => u.tabla === 'despacho_rm');
    expect(rmUpd?.filtros['eq:fecha']).toBe('30/07/2026');
    expect(rmUpd?.filtros['eq:seguimiento']).toBeUndefined();
  });

  it('si la tienda no tiene despacho, no actualiza', async () => {
    const { sb, updates } = mockSb({ despacho_rm: [], despacho_regiones: [] });
    await syncSeguimientoDespacho(sb as never, ['XXXXX'], 'Pendiente', true);
    expect(updates).toHaveLength(0);
  });
});
