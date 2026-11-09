import { describe, it, expect } from 'vitest';
import { unidadesPorMovimiento, unidadesSonDudosas, type GrupoMoveLine } from '../unidadesDeOdoo';

const g = (id: number, quantity: number | undefined, lines: number): GrupoMoveLine => ({
  picking_id: [id, `99REC/DT/${id}`],
  ...(quantity === undefined ? {} : { quantity }),
  picking_id_count: lines,
});

describe('unidadesPorMovimiento', () => {
  it('indexa unidades y líneas por id de movimiento', () => {
    const u = unidadesPorMovimiento([g(8722935, 252, 104), g(8722901, 40, 7)]);
    expect(u.porId[8722935]).toEqual({ units: 252, lines: 104 });
    expect(u.porId[8722901]).toEqual({ units: 40, lines: 7 });
    expect(u.grupos).toBe(2);
  });

  it('un grupo SIN la cantidad se cuenta aparte en vez de pasar como cero', () => {
    // Es el bug: Odoo devuelve el grupo sin la clave cuando se le pide un campo que no puede
    // agregar. Un `?? 0` lo convertía en un cero creíble.
    const u = unidadesPorMovimiento([g(1, undefined, 104)]);
    expect(u.sinCantidad).toBe(1);
    expect(u.porId[1]).toEqual({ units: 0, lines: 104 });
  });

  it('las líneas se leen igual aunque falte la cantidad', () => {
    // Fue lo que disimuló el error: «SKU» mostraba números correctos al lado de «Unidades» en 0.
    const u = unidadesPorMovimiento([g(1, undefined, 16)]);
    expect(u.porId[1].lines).toBe(16);
  });

  it('un grupo sin movimiento padre se descarta y NO cuenta como grupo', () => {
    const u = unidadesPorMovimiento([{ picking_id: false, quantity: 9, picking_id_count: 2 }, g(1, 5, 3)]);
    expect(u.grupos).toBe(1);
    expect(Object.keys(u.porId)).toEqual(['1']);
  });

  it('sin picking_id_count las líneas son 0, no undefined', () => {
    const u = unidadesPorMovimiento([{ picking_id: [1, 'x'], quantity: 5 }]);
    expect(u.porId[1]).toEqual({ units: 5, lines: 0 });
  });

  it('una cantidad de 0 es un dato y NO cuenta como ausencia', () => {
    const u = unidadesPorMovimiento([g(1, 0, 4)]);
    expect(u.sinCantidad).toBe(0);
    expect(u.porId[1].units).toBe(0);
  });

  it('acepta decimales: hay productos que se mueven por peso', () => {
    const u = unidadesPorMovimiento([g(1, 704.5, 2)]);
    expect(u.porId[1].units).toBe(704.5);
  });

  it('sin grupos devuelve vacío sin romperse', () => {
    const u = unidadesPorMovimiento([]);
    expect(u).toEqual({ porId: {}, sinCantidad: 0, grupos: 0 });
  });
});

describe('unidadesSonDudosas', () => {
  it('avisa cuando NINGÚN grupo trajo la cantidad', () => {
    // El caso real del 09/11: `qty_done` no está almacenado y Odoo devolvió los 20 grupos sin él.
    expect(unidadesSonDudosas(unidadesPorMovimiento([g(1, undefined, 5), g(2, undefined, 7)]))).toBe(true);
  });

  it('no avisa cuando solo a algunos les falta', () => {
    expect(unidadesSonDudosas(unidadesPorMovimiento([g(1, undefined, 5), g(2, 30, 7)]))).toBe(false);
  });

  it('no avisa cuando están todas', () => {
    expect(unidadesSonDudosas(unidadesPorMovimiento([g(1, 12, 5)]))).toBe(false);
  });

  it('sin grupos no avisa: no hay nada que mirar', () => {
    expect(unidadesSonDudosas(unidadesPorMovimiento([]))).toBe(false);
  });

  it('un día entero de ceros LEGÍTIMOS no dispara el aviso', () => {
    // La diferencia que el `?? 0` borraba: cero es un número, ausente es un campo que no llegó.
    expect(unidadesSonDudosas(unidadesPorMovimiento([g(1, 0, 5), g(2, 0, 7)]))).toBe(false);
  });
});
