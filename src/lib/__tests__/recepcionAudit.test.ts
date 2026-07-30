import { describe, it, expect } from 'vitest';
import { diffCampos, buildEdicionEntry } from '../recepcionAudit';

describe('diffCampos', () => {
  it('sin cambios cuando todo es igual', () => {
    const c = diffCampos(
      { pallets_recibidos: 2, bultos_recibidos: 1, acuse_recibo: 'Recibí conforme' },
      { pallets_recibidos: 2, bultos_recibidos: 1, acuse_recibo: 'Recibí conforme' },
    );
    expect(c).toEqual([]);
  });

  it('detecta cambio de cantidad con etiqueta legible', () => {
    const c = diffCampos({ pallets_recibidos: 2 }, { pallets_recibidos: 4 });
    expect(c).toEqual([{ campo: 'Pallets recibidos', de: 2, a: 4 }]);
  });

  it('detecta cambio de acuse y observaciones', () => {
    const c = diffCampos(
      { acuse_recibo: 'Recibí conforme', observaciones: '' },
      { acuse_recibo: 'Recibí con observaciones', observaciones: 'Faltan 2 bultos' },
    );
    expect(c).toContainEqual({ campo: 'Acuse', de: 'Recibí conforme', a: 'Recibí con observaciones' });
    expect(c).toContainEqual({ campo: 'Observaciones', de: null, a: 'Faltan 2 bultos' });
  });

  it('trata null/undefined/"" como equivalentes (sin cambio espurio)', () => {
    const c = diffCampos({ observaciones: null }, { observaciones: '' });
    expect(c).toEqual([]);
  });
});

describe('buildEdicionEntry', () => {
  it('arma la entrada con receptor, rut y cambios (recorta espacios)', () => {
    const e = buildEdicionEntry({
      prev: { pallets_recibidos: 2 },
      next: { pallets_recibidos: 3 },
      receptor: '  Ana Díaz  ',
      rut: ' 11.111.111-1 ',
      ts: '2026-07-30T12:00:00Z',
    });
    expect(e).toEqual({
      ts: '2026-07-30T12:00:00Z',
      receptor: 'Ana Díaz',
      rut: '11.111.111-1',
      cambios: [{ campo: 'Pallets recibidos', de: 2, a: 3 }],
    });
  });

  it('registra la persona aunque no haya cambios de cantidad (accountability)', () => {
    const e = buildEdicionEntry({
      prev: { pallets_recibidos: 2 }, next: { pallets_recibidos: 2 },
      receptor: 'Otra Persona', rut: '22.222.222-2',
    });
    expect(e.receptor).toBe('Otra Persona');
    expect(e.rut).toBe('22.222.222-2');
    expect(e.cambios).toEqual([]);
    expect(typeof e.ts).toBe('string');
  });
});
