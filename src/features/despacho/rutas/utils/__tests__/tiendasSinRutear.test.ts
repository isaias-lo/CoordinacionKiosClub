import { describe, it, expect } from 'vitest';
import { tiendasArmadasSinRutear } from '../tiendasSinRutear';

const cal = (over = {}) => ({ on: true, p: 0, b: 0, ch: 0, ...over });

describe('tiendasArmadasSinRutear', () => {
  it('detecta tiendas con carga que no están en ninguna ruta (caso 02SCL/56PZA)', () => {
    const calT = {
      '02SCL': cal({ p: 2, ch: 3 }),
      '56PZA': cal({ p: 4 }),
      '48BRU': cal({ p: 2, b: 1 }),
    };
    const rutas = [{ ts: [{ c: '48BRU' }] }]; // solo 48BRU ruteada
    expect(tiendasArmadasSinRutear(calT, rutas)).toEqual(['02SCL', '56PZA']);
  });

  it('no reporta tiendas sin carga (p/b/ch en 0) aunque estén on', () => {
    const calT = { '18FLO': cal({ on: true }) }; // on pero sin carga
    expect(tiendasArmadasSinRutear(calT, [])).toEqual([]);
  });

  it('no reporta tiendas apagadas (on=false) aunque tengan números', () => {
    const calT = { '18FLO': cal({ on: false, p: 3 }) };
    expect(tiendasArmadasSinRutear(calT, [])).toEqual([]);
  });

  it('cuenta chocolates como carga', () => {
    const calT = { '26ALC': cal({ p: 0, b: 0, ch: 6 }) };
    expect(tiendasArmadasSinRutear(calT, [])).toEqual(['26ALC']);
  });

  it('sin faltantes cuando todas las armadas están ruteadas', () => {
    const calT = { '48BRU': cal({ p: 2 }), '29CFL': cal({ p: 4 }) };
    const rutas = [{ ts: [{ c: '48BRU' }, { c: '29CFL' }] }];
    expect(tiendasArmadasSinRutear(calT, rutas)).toEqual([]);
  });

  it('devuelve orden alfabético estable', () => {
    const calT = { '56PZA': cal({ p: 1 }), '02SCL': cal({ p: 1 }), '30PHU': cal({ p: 1 }) };
    expect(tiendasArmadasSinRutear(calT, [])).toEqual(['02SCL', '30PHU', '56PZA']);
  });
});
