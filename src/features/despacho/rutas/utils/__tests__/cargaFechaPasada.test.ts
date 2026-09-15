import { describe, it, expect } from 'vitest';
import { aplicarCargaDelDia, type EntradaCalT } from '../cargaFechaPasada';

const g = () => 'rm';
const fila = (cod: string, pallets = 0, bultos = 0, contenedores = 0, chocolates = 0) =>
  ({ cod, pallets, bultos, contenedores, chocolates });

describe('el bug del 14/09: la tienda del calendario nunca recibía su carga', () => {
  it('una entrada del calendario VACÍA se completa', () => {
    // Así llega calT de un día pasado: el calendario pone la tienda, sin conteos.
    const calT: Record<string, EntradaCalT> = { '02SCL': { on: false, p: 0, b: 0, c: 0, ch: 0, g: 'rm' } };
    const out = aplicarCargaDelDia(calT, [fila('02SCL', 3, 2, 0, 4)], g);
    expect(out['02SCL']).toMatchObject({ on: true, p: 3, b: 2, ch: 4 });
  });

  it('y así vuelve a entrar al pool (on + carga), que es lo que exige enElPool', () => {
    const calT: Record<string, EntradaCalT> = { '05LP': { on: false, p: 0, b: 0, c: 0, ch: 0 } };
    const d = aplicarCargaDelDia(calT, [fila('05LP', 4, 3)], g)['05LP'];
    expect(d.on && (d.p > 0 || d.b > 0)).toBe(true);
  });

  it('las 9 del lunes 14 entran todas', () => {
    const cods = ['02SCL','05LP','06MQH','12LAS','47PTV','50PTM','52MUT','53VAL','57CAS'];
    const calT = Object.fromEntries(cods.map(c => [c, { on: false, p: 0, b: 0, c: 0, ch: 0 }])) as Record<string, EntradaCalT>;
    const out = aplicarCargaDelDia(calT, cods.map(c => fila(c, 3, 2)), g);
    expect(cods.every(c => out[c].on && out[c].p === 3)).toBe(true);
  });
});

describe('lo que NO debe pisar', () => {
  it('una entrada que YA tiene carga no se toca: la del tablero es más fresca', () => {
    const calT: Record<string, EntradaCalT> = { A: { on: true, p: 9, b: 9, c: 0, ch: 0, g: 'rm' } };
    expect(aplicarCargaDelDia(calT, [fila('A', 1, 1)], g)['A']).toMatchObject({ p: 9, b: 9 });
  });

  it('basta con que tenga contenedores o chocolates para considerarse cargada', () => {
    const calT: Record<string, EntradaCalT> = {
      A: { on: true, p: 0, b: 0, c: 2, ch: 0 }, B: { on: true, p: 0, b: 0, c: 0, ch: 3 },
    };
    const out = aplicarCargaDelDia(calT, [fila('A', 7), fila('B', 7)], g);
    expect(out['A'].p).toBe(0);
    expect(out['B'].p).toBe(0);
  });

  it('conserva el grupo y el resto de la entrada previa', () => {
    const calT: Record<string, EntradaCalT> = { A: { on: false, p: 0, b: 0, c: 0, ch: 0, g: 'costa' } };
    expect(aplicarCargaDelDia(calT, [fila('A', 2)], g)['A'].g).toBe('costa');
  });
});

describe('tiendas que no están en el calendario', () => {
  it('entran con el grupo que les asigne grupoDe', () => {
    const out = aplicarCargaDelDia({}, [fila('X', 1, 1)], () => 'fal');
    expect(out['X']).toMatchObject({ on: true, p: 1, b: 1, c: 0, ch: 0, g: 'fal' });
  });
});

describe('casos de borde', () => {
  it('una fila SIN carga no prende nada', () => {
    const calT: Record<string, EntradaCalT> = { A: { on: false, p: 0, b: 0, c: 0, ch: 0 } };
    expect(aplicarCargaDelDia(calT, [fila('A')], g)['A'].on).toBe(false);
  });

  it('sin filas devuelve el MISMO objeto (evita re-render en vano)', () => {
    const calT: Record<string, EntradaCalT> = { A: { on: true, p: 1, b: 0, c: 0, ch: 0 } };
    expect(aplicarCargaDelDia(calT, [], g)).toBe(calT);
  });

  it('si nada cambia también devuelve el mismo objeto', () => {
    const calT: Record<string, EntradaCalT> = { A: { on: true, p: 5, b: 0, c: 0, ch: 0 } };
    expect(aplicarCargaDelDia(calT, [fila('A', 1)], g)).toBe(calT);
  });

  it('una fila sin código se ignora', () => {
    expect(aplicarCargaDelDia({}, [fila('', 3)], g)).toEqual({});
  });
});
