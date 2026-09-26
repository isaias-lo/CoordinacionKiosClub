import { describe, it, expect } from 'vitest';
import { normPatente, parseCerradas, serializeCerradas } from '../cierrePorVehiculo';

describe('normPatente', () => {
  it('recorta y pasa a mayúsculas', () => {
    expect(normPatente('  ptfz21 ')).toBe('PTFZ21');
  });

  it('tolera vacío', () => {
    expect(normPatente('')).toBe('');
  });
});

describe('parseCerradas / serializeCerradas — lo que viaja en shared_session_state', () => {
  it('lee la forma con objeto', () => {
    expect([...parseCerradas({ patentes: ['PTFZ21', 'rzbl80'] })].sort()).toEqual(['PTFZ21', 'RZBL80']);
  });

  it('lee un array plano', () => {
    expect([...parseCerradas(['PTFZ21'])]).toEqual(['PTFZ21']);
  });

  it('sin dato devuelve un set vacío, nunca null', () => {
    // Un `null` acá se leería como "no hay cerradas" igual, pero rompería a quien haga `.has`.
    for (const v of [null, undefined, 42, 'texto', {}]) expect(parseCerradas(v).size).toBe(0);
  });

  it('descarta entradas que no son patentes', () => {
    expect([...parseCerradas({ patentes: ['PTFZ21', '', '   ', 7, null] })]).toEqual(['PTFZ21']);
  });

  it('ida y vuelta', () => {
    const set = new Set(['PTFZ21', 'RZBL80']);
    expect([...parseCerradas(serializeCerradas(set))].sort()).toEqual(['PTFZ21', 'RZBL80']);
  });
});
