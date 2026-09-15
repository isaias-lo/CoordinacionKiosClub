import { describe, it, expect } from 'vitest';
import { moverEnLista } from '../reordenar';

describe('moverEnLista', () => {
  it('mueve un elemento hacia abajo', () => {
    expect(moverEnLista(['A', 'B', 'C'], 0, 1)).toEqual(['B', 'A', 'C']);
  });

  it('mueve un elemento hacia arriba', () => {
    expect(moverEnLista(['A', 'B', 'C'], 2, -1)).toEqual(['A', 'C', 'B']);
  });

  it('no hace nada si ya está primero y se intenta subir más', () => {
    const lista = ['A', 'B', 'C'];
    expect(moverEnLista(lista, 0, -1)).toEqual(['A', 'B', 'C']);
  });

  it('no hace nada si ya está último y se intenta bajar más', () => {
    const lista = ['A', 'B', 'C'];
    expect(moverEnLista(lista, 2, 1)).toEqual(['A', 'B', 'C']);
  });

  it('no muta el arreglo original', () => {
    const lista = ['A', 'B', 'C'];
    const copia = [...lista];
    moverEnLista(lista, 0, 1);
    expect(lista).toEqual(copia);
  });

  it('funciona con una lista de un solo elemento (ambas direcciones son no-op)', () => {
    expect(moverEnLista(['A'], 0, 1)).toEqual(['A']);
    expect(moverEnLista(['A'], 0, -1)).toEqual(['A']);
  });
});
