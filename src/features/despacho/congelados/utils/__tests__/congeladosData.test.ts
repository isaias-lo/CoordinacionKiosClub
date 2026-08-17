import { describe, it, expect } from 'vitest';
import {
  tiendasCongeladosDelDia,
  contarCajasCongelados,
  cajasCongeladosPorTienda,
} from '../congeladosData';
import type { CalRecord } from '@/lib/calendarioCongeladosSync';

// 2024-01-01 es lunes → DAY_CODES[getDay()] = 'LU'.
const LUNES = new Date(2024, 0, 1);

describe('tiendasCongeladosDelDia', () => {
  const cal: CalRecord = {
    LU: { rm: ['23PEÑ', '48BRU'], costa: ['57CAS'], fal: ['26ALC', ''] },
    MA: { rm: [], costa: [], fal: [] },
  };

  it("grupo 'all' concatena rm+costa+fal del día", () => {
    expect(tiendasCongeladosDelDia(cal, 'all', LUNES)).toEqual([
      '23PEÑ', '48BRU', '57CAS', '26ALC',
    ]);
  });

  it("grupo específico devuelve solo ese array", () => {
    expect(tiendasCongeladosDelDia(cal, 'rm', LUNES)).toEqual(['23PEÑ', '48BRU']);
    expect(tiendasCongeladosDelDia(cal, 'costa', LUNES)).toEqual(['57CAS']);
    expect(tiendasCongeladosDelDia(cal, 'fal', LUNES)).toEqual(['26ALC']);
  });

  it('día sin datos en el CalRecord devuelve []', () => {
    const miercoles = new Date(2024, 0, 3); // 'MI', no está en cal
    expect(tiendasCongeladosDelDia(cal, 'all', miercoles)).toEqual([]);
  });

  it('dedupe preservando orden', () => {
    const calDup: CalRecord = {
      LU: { rm: ['23PEÑ', '48BRU'], costa: ['23PEÑ'], fal: ['48BRU'] },
    };
    expect(tiendasCongeladosDelDia(calDup, 'all', LUNES)).toEqual(['23PEÑ', '48BRU']);
  });

  it('ignora códigos vacíos', () => {
    const calVacios: CalRecord = {
      LU: { rm: ['', '23PEÑ', ''], costa: [], fal: [] },
    };
    expect(tiendasCongeladosDelDia(calVacios, 'all', LUNES)).toEqual(['23PEÑ']);
  });

  it("día vacío (rm/costa/fal todos []) devuelve []", () => {
    const martes = new Date(2024, 0, 2); // 'MA'
    expect(tiendasCongeladosDelDia(cal, 'all', martes)).toEqual([]);
  });
});

describe('contarCajasCongelados', () => {
  it('cuenta CC/CN congelados e ignora seco (hogar/comida)', () => {
    const slots = [
      { tipo: 'CC', contenido: 'congelados' },
      { tipo: 'CC', contenido: 'congelados' },
      { tipo: 'CN', contenido: 'congelados' },
      { tipo: 'CC', contenido: 'hogar' },
      { tipo: 'CN', contenido: 'comida' },
    ];
    expect(contarCajasCongelados(slots)).toEqual({ total: 3, cc: 2, cn: 1 });
  });

  it('sin congelados devuelve {0,0,0}', () => {
    const slots = [
      { tipo: 'CC', contenido: 'hogar' },
      { tipo: 'CN', contenido: 'comida' },
    ];
    expect(contarCajasCongelados(slots)).toEqual({ total: 0, cc: 0, cn: 0 });
  });

  it('array vacío devuelve {0,0,0}', () => {
    expect(contarCajasCongelados([])).toEqual({ total: 0, cc: 0, cn: 0 });
  });
});

describe('cajasCongeladosPorTienda', () => {
  it('mapea por tienda, omite las que no tienen congelados, y separa CC/CN', () => {
    const slotsPorTienda = {
      '23PEÑ': [
        { tipo: 'CC', contenido: 'congelados' },
        { tipo: 'CC', contenido: 'congelados' },
        { tipo: 'CN', contenido: 'congelados' },
      ],
      '48BRU': [
        { tipo: 'CC', contenido: 'hogar' },
        { tipo: 'CN', contenido: 'comida' },
      ],
      '57CAS': [
        { tipo: 'CN', contenido: 'congelados' },
      ],
    };
    expect(cajasCongeladosPorTienda(slotsPorTienda)).toEqual({
      '23PEÑ': { total: 3, cc: 2, cn: 1 },
      '57CAS': { total: 1, cc: 0, cn: 1 },
    });
  });

  it('objeto vacío devuelve objeto vacío', () => {
    expect(cajasCongeladosPorTienda({})).toEqual({});
  });
});
