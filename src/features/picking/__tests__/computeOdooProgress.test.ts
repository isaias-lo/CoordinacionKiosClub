import { describe, it, expect } from 'vitest';
import { esOpCongelados, computeOdooProgress } from '../picking-utils';

describe('esOpCongelados', () => {
  it('true para un origin de Abastecimiento Congelados', () => {
    expect(esOpCongelados('Abastecimiento Congelados (01TPS) Fecha(16/06/2026)')).toBe(true);
  });

  it('false para otras categorías de Abastecimiento', () => {
    expect(esOpCongelados('Abastecimiento Hogar (01TPS)')).toBe(false);
  });

  it('false para string vacío', () => {
    expect(esOpCongelados('')).toBe(false);
  });

  it('false para "Abastecimiento Comida" (no matchea por substring)', () => {
    expect(esOpCongelados('Abastecimiento Comida')).toBe(false);
  });
});

describe('computeOdooProgress', () => {
  type MockPicking = { origin: string; state: string; toLocation?: string; partner?: string };

  it('separa el conteo seco/congelados por tienda, ignora no-abastecimiento/AUDITORIA/no-pickeable', () => {
    const pickings: MockPicking[] = [
      // Tienda 01TPS: congelados done
      { origin: 'Abastecimiento Congelados (01TPS) Fecha(16/06/2026)', state: 'done', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 01TPS: congelados no-done (assigned = pickeable)
      { origin: 'Abastecimiento Congelados (01TPS) Fecha(16/06/2026)', state: 'assigned', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 01TPS: seco (Hogar) done
      { origin: 'Abastecimiento Hogar (01TPS) Fecha(16/06/2026)', state: 'done', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 01TPS: seco (Comida) no-done
      { origin: 'Abastecimiento Comida (01TPS) Fecha(16/06/2026)', state: 'partially_available', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 01TPS: NO abastecimiento → ignorada por completo
      { origin: 'Transferencia interna (01TPS)', state: 'done', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 01TPS: AUDITORIA → ignorada aunque diga Abastecimiento
      { origin: 'AUDITORIA Abastecimiento Congelados (01TPS)', state: 'done', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 01TPS: no-pickeable (confirmed sin stock reservado) → ignorada
      { origin: 'Abastecimiento Congelados (01TPS) Fecha(16/06/2026)', state: 'confirmed', toLocation: 'WH/PICK/01TPS/Stock' },
      // Tienda 42ANP: congelados done, para verificar que no se mezcla entre tiendas
      { origin: 'Abastecimiento Congelados (42ANP) Fecha(16/06/2026)', state: 'done', toLocation: 'WH/PICK/42ANP/Stock' },
    ];

    const result = computeOdooProgress(pickings);

    // 01TPS: total pickeable = congelados(done)+congelados(assigned)+hogar(done)+comida(partially_available) = 4
    // done = congelados(done) + hogar(done) = 2
    // congTotal = congelados(done)+congelados(assigned) = 2; congDone = congelados(done) = 1
    expect(result['01TPS']).toEqual({ total: 4, done: 2, congTotal: 2, congDone: 1 });

    // 42ANP: solo 1 op congelados done
    expect(result['42ANP']).toEqual({ total: 1, done: 1, congTotal: 1, congDone: 1 });

    // congTotal/congDone son subconjunto de total/done
    for (const store of Object.values(result)) {
      expect(store.congTotal).toBeLessThanOrEqual(store.total);
      expect(store.congDone).toBeLessThanOrEqual(store.done);
    }
  });

  it('tienda sin ninguna op congelados → congTotal/congDone en 0', () => {
    const pickings: MockPicking[] = [
      { origin: 'Abastecimiento Hogar (28TEM) Fecha(16/06/2026)', state: 'done', toLocation: 'WH/PICK/28TEM/Stock' },
    ];
    const result = computeOdooProgress(pickings);
    expect(result['28TEM']).toEqual({ total: 1, done: 1, congTotal: 0, congDone: 0 });
  });

  it('array vacío → objeto vacío', () => {
    expect(computeOdooProgress([])).toEqual({});
  });
});
