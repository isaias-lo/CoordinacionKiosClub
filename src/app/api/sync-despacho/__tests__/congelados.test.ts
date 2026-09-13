import { describe, it, expect } from 'vitest';
import { repartirCongelados } from '../congelados';

// Las tres tiendas reales del 11/09 son de RM; 60PBL sirve de Nacional.
const NACIONAL = new Set(['60PBL', '31TLC']);
const SANTIAGO = new Set(['22LGN', '16PQA', '02SCL']);
const esNacional = (c: string) => NACIONAL.has(c);
const esSantiago = (c: string) => SANTIAGO.has(c);

describe('repartirCongelados', () => {
  it('manda cada tienda a la tabla de su catálogo', () => {
    const r = repartirCongelados(
      [{ cod: '22LGN' }, { cod: '60PBL' }, { cod: '16PQA' }],
      esNacional, esSantiago,
    );
    expect(r.rm.map(f => f.cod)).toEqual(['22LGN', '16PQA']);
    expect(r.regiones.map(f => f.cod)).toEqual(['60PBL']);
    expect(r.huerfanos).toEqual([]);
  });

  it('un código que no está en ningún catálogo NO se manda a una tabla al azar', () => {
    const r = repartirCongelados([{ cod: '99XXX' }], esNacional, esSantiago);
    expect(r.rm).toEqual([]);
    expect(r.regiones).toEqual([]);
    expect(r.huerfanos).toEqual(['99XXX']);
  });

  it('una fila sin código se reporta en vez de tragarse', () => {
    const r = repartirCongelados([{ cod: '' }, { cod: null }, {}], esNacional, esSantiago);
    expect(r.huerfanos).toEqual(['(sin código)', '(sin código)', '(sin código)']);
  });

  it('normaliza espacios y minúsculas antes de buscar', () => {
    const r = repartirCongelados([{ cod: ' 22lgn ' }], esNacional, esSantiago);
    expect(r.rm).toHaveLength(1);
  });

  it('Nacional gana si un código estuviera en los dos catálogos: Sendu manda', () => {
    const r = repartirCongelados([{ cod: '31TLC' }], esNacional, () => true);
    expect(r.regiones.map(f => f.cod)).toEqual(['31TLC']);
    expect(r.rm).toEqual([]);
  });

  it('sin filas no inventa nada', () => {
    expect(repartirCongelados([], esNacional, esSantiago)).toEqual({ rm: [], regiones: [], huerfanos: [] });
  });

  it('conserva el resto de los campos del registro', () => {
    const r = repartirCongelados(
      [{ cod: '22LGN', id: 'CONG-11092026-22LGN-CC-1', regimen: 'Congelado' }],
      esNacional, esSantiago,
    );
    expect(r.rm[0]).toMatchObject({ id: 'CONG-11092026-22LGN-CC-1', regimen: 'Congelado' });
  });
});
