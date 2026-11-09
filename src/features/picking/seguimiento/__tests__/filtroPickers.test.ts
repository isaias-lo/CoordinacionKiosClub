import { describe, it, expect } from 'vitest';
import {
  cuentasDe, repartirPorListaDePickers, textoCuentasFuera, type FilaDePicker,
} from '../filtroPickers';

/** La lista real: las cuentas built-in más las claves de `picker_canonical_names`. */
const LISTA = new Set(['pickers 11', 'pickers 13', 'pickers 15', 'adquisiciones', 'control interno',
  'movimiento interno', 'supervisor web']);
const esDePickers = (c: string) => LISTA.has(c.toLowerCase().trim());

const fila = (name: string, cuentas?: string[], ops = 1): FilaDePicker =>
  cuentas ? { name, cuentas, ops } : { name, ops };

describe('cuentasDe', () => {
  it('usa `cuentas` cuando está', () => {
    expect(cuentasDe(fila('Diego Farr', ['Pickers 11']))).toEqual(['Pickers 11']);
  });

  it('sin `cuentas`, el nombre ES la cuenta (cache guardado antes del #788)', () => {
    expect(cuentasDe(fila('Pickers 11'))).toEqual(['Pickers 11']);
  });

  it('una lista vacía de cuentas se trata como ausente', () => {
    expect(cuentasDe(fila('Pickers 11', []))).toEqual(['Pickers 11']);
  });
});

describe('repartirPorListaDePickers: el bug del #788', () => {
  it('una fila con nombre de PERSONA entra por su cuenta', () => {
    // Es el caso exacto que se rompió: «Diego Farr» no está en ninguna lista de cuentas.
    const r = repartirPorListaDePickers([fila('Diego Farr', ['Pickers 11'])], esDePickers);
    expect(r.dentro.map(f => f.name)).toEqual(['Diego Farr']);
    expect(r.fuera).toHaveLength(0);
  });

  it('quien usó DOS pistolas entra si al menos una está en la lista', () => {
    const r = repartirPorListaDePickers(
      [fila('Cristobal Labra', ['Pickers 15', 'Pistola nueva'])], esDePickers);
    expect(r.dentro).toHaveLength(1);
  });

  it('una cuenta que no está en la lista queda fuera', () => {
    const r = repartirPorListaDePickers([fila('Mario Patiño', ['Mario Patiño'], 410)], esDePickers);
    expect(r.dentro).toHaveLength(0);
    expect(r.opsFuera).toBe(410);
    expect(r.cuentasFuera).toEqual(['Mario Patiño']);
  });

  it('reparte un período completo sin perder ninguna fila', () => {
    const filas = [
      fila('Diego Farr', ['Pickers 11'], 62),
      fila('Valentina Conejera', ['Pickers 13'], 47),
      fila('Mario Patiño', ['Mario Patiño'], 124),
      fila('Abastecimiento', ['Abastecimiento'], 1),
    ];
    const r = repartirPorListaDePickers(filas, esDePickers);
    expect(r.dentro).toHaveLength(2);
    expect(r.fuera).toHaveLength(2);
    expect(r.dentro.length + r.fuera.length).toBe(filas.length);
    expect(r.opsFuera).toBe(125);
  });

  it('conserva el orden en que venían las filas', () => {
    const r = repartirPorListaDePickers(
      [fila('C', ['Pickers 15']), fila('A', ['Pickers 11']), fila('B', ['Pickers 13'])], esDePickers);
    expect(r.dentro.map(f => f.name)).toEqual(['C', 'A', 'B']);
  });

  it('un cache viejo —con la cuenta como nombre— se sigue filtrando bien', () => {
    // Lo guardado en el navegador antes del #788 no tiene `cuentas`. Si se vaciara la pantalla,
    // el arreglo se vería roto hasta que alguien apretara «Actualizar datos».
    const r = repartirPorListaDePickers(
      [fila('Pickers 11', undefined, 5), fila('Mario Patiño', undefined, 3)], esDePickers);
    expect(r.dentro.map(f => f.name)).toEqual(['Pickers 11']);
    expect(r.opsFuera).toBe(3);
  });

  it('no le importan las mayúsculas si el predicado no se las mira', () => {
    const r = repartirPorListaDePickers([fila('control interno', ['Control Interno'], 10)], esDePickers);
    expect(r.dentro).toHaveLength(1);
  });

  it('sin filas devuelve vacío sin romperse', () => {
    expect(repartirPorListaDePickers([], esDePickers))
      .toEqual({ dentro: [], fuera: [], opsFuera: 0, cuentasFuera: [] });
  });
});

describe('repartirPorListaDePickers: lo que queda fuera', () => {
  it('las cuentas fuera van de mayor a menor en operaciones', () => {
    // En octubre una sola cuenta explicaba 410 de las 471: alfabético lo escondería.
    const r = repartirPorListaDePickers([
      fila('Abastecimiento', ['Abastecimiento'], 8),
      fila('Mario Patiño', ['Mario Patiño'], 410),
      fila('Sofía Leonor', ['Sofía Leonor'], 20),
    ], esDePickers);
    expect(r.cuentasFuera).toEqual(['Mario Patiño', 'Sofía Leonor', 'Abastecimiento']);
  });

  it('con el mismo peso, desempata alfabéticamente', () => {
    const r = repartirPorListaDePickers(
      [fila('Zeta', ['Zeta'], 5), fila('Alfa', ['Alfa'], 5)], esDePickers);
    expect(r.cuentasFuera).toEqual(['Alfa', 'Zeta']);
  });

  it('una cuenta no se repite aunque venga en dos filas', () => {
    const r = repartirPorListaDePickers(
      [fila('X', ['Externo'], 2), fila('Y', ['Externo'], 3)], esDePickers);
    expect(r.cuentasFuera).toEqual(['Externo']);
    expect(r.opsFuera).toBe(5);
  });

  it('las cuentas de una fila que SÍ entró no se reportan como fuera', () => {
    // Una pistola nueva que entró de la mano de una conocida no es una cuenta «perdida».
    const r = repartirPorListaDePickers(
      [fila('Cristobal Labra', ['Pickers 15', 'Pistola nueva'], 9)], esDePickers);
    expect(r.cuentasFuera).toEqual([]);
    expect(r.opsFuera).toBe(0);
  });
});

describe('textoCuentasFuera', () => {
  it('una sola va sola', () => {
    expect(textoCuentasFuera(['Mario Patiño'])).toBe('Mario Patiño');
  });

  it('dos van con «y»', () => {
    expect(textoCuentasFuera(['Mario Patiño', 'Abastecimiento'])).toBe('Mario Patiño y Abastecimiento');
  });

  it('más de dos cuentan el resto', () => {
    expect(textoCuentasFuera(['Mario Patiño', 'Abastecimiento', '38SP2', '39PSB']))
      .toBe('Mario Patiño, Abastecimiento y 2 más');
  });

  it('sin cuentas no dice nada', () => {
    expect(textoCuentasFuera([])).toBe('');
  });

  it('se puede pedir que muestre más', () => {
    expect(textoCuentasFuera(['A', 'B', 'C', 'D'], 3)).toBe('A, B, C y 1 más');
  });
});
