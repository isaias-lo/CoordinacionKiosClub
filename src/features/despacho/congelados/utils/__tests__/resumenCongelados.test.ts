import { describe, it, expect } from 'vitest';
import { resumenCongelados, textoTotalCongelados, textoSinCarga } from '../resumenCongelados';

// El día real del 11/09/2026: 22LGN 13 cajas, 16PQA 4, 02SCL 2, y el resto del calendario en cero.
const CODS = ['01TPS', '22LGN', '13PIE', '16PQA', '31TLC', '02SCL'];
const CAJAS = { '22LGN': { total: 13 }, '16PQA': { total: 4 }, '02SCL': { total: 2 } };

describe('resumenCongelados', () => {
  it('separa las que tienen carga de las que no', () => {
    const r = resumenCongelados(CODS, CAJAS, new Set());
    expect(r.conCarga.sort()).toEqual(['02SCL', '16PQA', '22LGN']);
    expect(r.sinCarga.sort()).toEqual(['01TPS', '13PIE', '31TLC']);
  });

  it('suma las cajas del día', () => {
    expect(resumenCongelados(CODS, CAJAS, new Set()).totalCajas).toBe(19);
  });

  it('las pendientes de registrar van primero', () => {
    const r = resumenCongelados(CODS, CAJAS, new Set(['22LGN']));
    expect(r.conCarga[r.conCarga.length - 1]).toBe('22LGN'); // ya registrada, al final
    expect(r.pendientes).toBe(2);
  });

  it('cuando está todo registrado no queda ninguna pendiente', () => {
    const r = resumenCongelados(CODS, CAJAS, new Set(['22LGN', '16PQA', '02SCL']));
    expect(r.pendientes).toBe(0);
    expect(r.conCarga).toHaveLength(3); // siguen visibles: confirman que se hizo
  });

  it('un día sin carga no tiene pendientes ni total', () => {
    const r = resumenCongelados(CODS, {}, new Set());
    expect(r).toMatchObject({ totalCajas: 0, pendientes: 0 });
    expect(r.conCarga).toEqual([]);
  });
});

describe('textos del resumen', () => {
  it('el total del día', () => {
    expect(textoTotalCongelados(resumenCongelados(CODS, CAJAS, new Set()))).toBe('19 cajas · 3 tiendas');
  });

  it('una sola caja va en singular', () => {
    expect(textoTotalCongelados(resumenCongelados(['A'], { A: { total: 1 } }, new Set()))).toBe('1 caja · 1 tienda');
  });

  it('sin carga no dice nada', () => {
    expect(textoTotalCongelados(resumenCongelados(CODS, {}, new Set()))).toBe('');
  });

  it('cuenta las tiendas en cero', () => {
    expect(textoSinCarga(resumenCongelados(CODS, CAJAS, new Set()))).toBe('3 tiendas sin congelados');
    expect(textoSinCarga(resumenCongelados(['A'], { A: { total: 2 } }, new Set()))).toBe('');
  });
});
