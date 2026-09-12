import { describe, it, expect } from 'vitest';
import { filasPorId } from '../limpiarDespacho';

// La columna A de la hoja: fila 1 = encabezado, el resto ids de despacho.
const colA = ['ID', 'P151SER11092026P', '1B01TPS12092026B', 'P251SER11092026P', '2B01TPS12092026B'];

describe('filasPorId', () => {
  it('ubica la fila del id buscado (1-indexada, contando el encabezado)', () => {
    expect(filasPorId(colA, new Set(['P251SER11092026P']))).toEqual([4]);
  });

  it('devuelve las filas de mayor a menor: borrar de abajo hacia arriba no corre a las demás', () => {
    expect(filasPorId(colA, new Set(['P151SER11092026P', '2B01TPS12092026B']))).toEqual([5, 2]);
  });

  it('nunca devuelve el encabezado, aunque el id se llame "ID"', () => {
    expect(filasPorId(colA, new Set(['ID']))).toEqual([]);
  });

  it('sin coincidencias no borra nada', () => {
    expect(filasPorId(colA, new Set(['no-existe']))).toEqual([]);
  });

  it('ignora espacios y celdas vacías', () => {
    expect(filasPorId(['ID', '  P151SER11092026P  ', null, undefined], new Set(['P151SER11092026P']))).toEqual([2]);
  });

  it('una hoja vacía no rompe', () => {
    expect(filasPorId([], new Set(['x']))).toEqual([]);
  });
});
