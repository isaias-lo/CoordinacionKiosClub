import { describe, it, expect } from 'vitest';
import { reaplicarCounts } from '../reaplicarCounts';
import type { SesionRow } from '../../../../../lib/despachoSesion';

const row = (over: Partial<SesionRow> = {}): SesionRow => ({
  fecha: '2026-08-04', fuente: 'santiago', tienda_cod: '26ALC',
  pallets: 0, bultos: 0, contenedores: 0, chocolates: 0, ...over,
});
const cal = (over = {}) => ({ on: false, p: 0, b: 0, c: 0, ch: 0, g: 'rm', ...over });

describe('reaplicarCounts', () => {
  it('rellena counts de despacho_sesion en tiendas presentes en calT (caso 26ALC tras traer calendario)', () => {
    const calT = { '26ALC': cal({ g: 'rm' }) };
    const rows = new Map<string, SesionRow>([['26ALC', row({ pallets: 2, chocolates: 6 })]]);
    const out = reaplicarCounts(calT, rows, new Set());
    expect(out['26ALC']).toMatchObject({ p: 2, ch: 6, on: true });
  });

  it('ignora tiendas que no están en calT (no las crea)', () => {
    const calT = { '26ALC': cal() };
    const rows = new Map<string, SesionRow>([['99XXX', row({ tienda_cod: '99XXX', pallets: 5 })]]);
    const out = reaplicarCounts(calT, rows, new Set());
    expect(out['99XXX']).toBeUndefined();
    expect(Object.keys(out)).toEqual(['26ALC']);
  });

  it('respeta ediciones manuales (no pisa lo tecleado a mano)', () => {
    const calT = { '26ALC': cal({ p: 9, on: true }) };
    const rows = new Map<string, SesionRow>([['26ALC', row({ pallets: 2 })]]);
    const out = reaplicarCounts(calT, rows, new Set(['26ALC']));
    expect(out['26ALC'].p).toBe(9);
  });

  it('on=false cuando todos los counts son 0', () => {
    const calT = { '26ALC': cal({ on: true, p: 3 }) };
    const rows = new Map<string, SesionRow>([['26ALC', row()]]); // todo en 0
    const out = reaplicarCounts(calT, rows, new Set());
    expect(out['26ALC']).toMatchObject({ p: 0, b: 0, ch: 0, on: false });
  });

  it('no muta el calT de entrada', () => {
    const calT = { '26ALC': cal() };
    const rows = new Map<string, SesionRow>([['26ALC', row({ pallets: 2 })]]);
    const snapshot = JSON.stringify(calT);
    reaplicarCounts(calT, rows, new Set());
    expect(JSON.stringify(calT)).toBe(snapshot);
  });
});
