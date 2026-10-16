import { describe, it, expect } from 'vitest';
import { esDeCongelados, soloSeco, TIPOS_CONGELADOS } from '../unidadDeCongelados';

describe('esDeCongelados', () => {
  it('EL CASO DE 17MAI: las cajas que ensuciaban la tienda', () => {
    expect(esDeCongelados({ tipo: 'CC', section: 'congelados', contenido: 'congelados' })).toBe(true);
    expect(esDeCongelados({ tipo: 'CN', section: 'congelados', contenido: 'congelados' })).toBe(true);
  });

  it('las de seco no se tocan', () => {
    expect(esDeCongelados({ tipo: 'P',  section: 'comida',     contenido: 'comida' })).toBe(false);
    expect(esDeCongelados({ tipo: 'B',  section: 'hogar',      contenido: 'aseo-hogar' })).toBe(false);
    expect(esDeCongelados({ tipo: 'CH', section: 'chocolates', contenido: 'chocolate' })).toBe(false);
    expect(esDeCongelados({ tipo: 'A',  section: null,         contenido: null })).toBe(false);
    expect(esDeCongelados({ tipo: 'W',  section: null,         contenido: null })).toBe(false);
    expect(esDeCongelados({ tipo: 'C',  section: 'aseo',       contenido: 'aseo' })).toBe(false);
  });

  it('cualquiera de las tres señales alcanza', () => {
    // `section` es nueva: las filas anteriores al 08/10 la traen vacía y hay que reconocerlas igual.
    expect(esDeCongelados({ tipo: 'CC', section: null, contenido: null })).toBe(true);
    expect(esDeCongelados({ tipo: null, section: 'congelados', contenido: null })).toBe(true);
    expect(esDeCongelados({ tipo: null, section: null, contenido: 'congelados' })).toBe(true);
  });

  it('no se marea con mayúsculas ni espacios', () => {
    expect(esDeCongelados({ tipo: ' cc ' })).toBe(true);
    expect(esDeCongelados({ section: 'CONGELADOS' })).toBe(true);
    expect(esDeCongelados({ contenido: ' Congelados' })).toBe(true);
  });

  it('una unidad vacía o rota no se da por congelada', () => {
    // El lado seguro es dejarla en seco: esconderla sería perder trabajo de vista.
    expect(esDeCongelados(null)).toBe(false);
    expect(esDeCongelados(undefined)).toBe(false);
    expect(esDeCongelados({})).toBe(false);
    expect(esDeCongelados({ tipo: '', section: '', contenido: '' })).toBe(false);
  });

  it('los dos tipos de caja son los que dice Congelados', () => {
    expect([...TIPOS_CONGELADOS]).toEqual(['CC', 'CN']);
  });
});

describe('soloSeco', () => {
  it('deja fuera las cajas de congelados y conserva el orden', () => {
    const unidades = [
      { id: 1, tipo: 'CC', section: 'congelados' },
      { id: 2, tipo: 'P',  section: 'comida' },
      { id: 3, tipo: 'CN', section: 'congelados' },
      { id: 4, tipo: 'CH', section: 'chocolates' },
    ];
    expect(soloSeco(unidades).map(u => u.id)).toEqual([2, 4]);
  });

  it('sin congelados devuelve todo', () => {
    const unidades = [{ tipo: 'P' }, { tipo: 'B' }];
    expect(soloSeco(unidades)).toHaveLength(2);
  });

  it('una lista vacía no rompe', () => {
    expect(soloSeco([])).toEqual([]);
  });
});
