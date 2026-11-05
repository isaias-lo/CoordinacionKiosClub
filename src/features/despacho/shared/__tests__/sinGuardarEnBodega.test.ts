import { describe, it, expect } from 'vitest';
import { unidadesSinGuardar, avisoSinGuardar, textoPendientesAlEscanear } from '../sinGuardarEnBodega';

const slot = (id: number, tipo: string, contenido = 'hogar') => ({ id, tipo, contenido });

describe('unidadesSinGuardar', () => {
  it('13PIE: 3 bultos impresos en Picking que Bodega nunca guardó', () => {
    const slots = [slot(12938, 'P'), slot(12943, 'B'), slot(12944, 'B'), slot(12945, 'B')];
    const conteo = unidadesSinGuardar(slots, [{ pickingSlotId: 12938 }]);
    expect(conteo).toMatchObject({ P: 0, B: 3, total: 3 });
  });

  it('no cuenta nada cuando Bodega guardó todo', () => {
    const slots = [slot(1, 'P'), slot(2, 'B')];
    expect(unidadesSinGuardar(slots, [{ pickingSlotId: 1 }, { pickingSlotId: 2 }]).total).toBe(0);
  });

  it('ignora congelados: son de otro módulo', () => {
    const slots = [slot(1, 'CC', 'congelados'), slot(2, 'P', 'Abastecimiento Congelados'), slot(3, 'B')];
    expect(unidadesSinGuardar(slots, []).total).toBe(1);
  });

  it('ignora ítems sin unidad de Picking al comparar', () => {
    expect(unidadesSinGuardar([slot(1, 'P')], [{}, { pickingSlotId: undefined }]).total).toBe(1);
  });

  it('cuenta por tipo', () => {
    const slots = [slot(1, 'P'), slot(2, 'P'), slot(3, 'B'), slot(4, 'C'), slot(5, 'CH')];
    expect(unidadesSinGuardar(slots, [])).toEqual({ P: 2, B: 1, C: 1, CH: 1, total: 5 });
  });
});

describe('avisoSinGuardar', () => {
  it('sin faltantes no avisa', () => {
    expect(avisoSinGuardar({ P: 0, B: 0, C: 0, CH: 0, total: 0 })).toBeNull();
  });

  it('un solo tipo, en singular', () => {
    expect(avisoSinGuardar({ P: 1, B: 0, C: 0, CH: 0, total: 1 })).toContain('1 pallet de Picking sin guardar');
  });

  it('un solo tipo, en plural', () => {
    expect(avisoSinGuardar({ P: 0, B: 3, C: 0, CH: 0, total: 3 })).toContain('3 bultos de Picking sin guardar');
  });

  it('varios tipos se enumeran', () => {
    expect(avisoSinGuardar({ P: 2, B: 1, C: 0, CH: 1, total: 4 })).toContain('2 pallets, 1 bulto y 1 chocolate');
  });
});

describe('textoPendientesAlEscanear', () => {
  it('cuenta las otras, sin la escaneada', () => {
    expect(textoPendientesAlEscanear(4, true)).toBe('faltan 3 más en esta tienda');
    expect(textoPendientesAlEscanear(2, true)).toBe('falta 1 más en esta tienda');
  });
  it('la escaneada es la última', () => {
    expect(textoPendientesAlEscanear(1, true)).toBe('es la última que falta en esta tienda');
  });
  it('la escaneada ya estaba guardada y no falta nada', () => {
    expect(textoPendientesAlEscanear(0, false)).toBe('no le falta nada a esta tienda');
  });
  it('la escaneada ya estaba guardada pero faltan otras', () => {
    expect(textoPendientesAlEscanear(3, false)).toBe('faltan 3 más en esta tienda');
  });
});
