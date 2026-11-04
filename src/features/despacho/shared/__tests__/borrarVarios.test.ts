import { describe, it, expect } from 'vitest';
import { indicesABorrar } from '../borrarVarios';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const esDe = (i: { id: string }, f: string) => i.id === f;

describe('indicesABorrar', () => {
  it('de mayor a menor, para que borrar uno no corra al siguiente', () => {
    expect(indicesABorrar(items, ['b', 'd', 'a'], esDe)).toEqual([3, 1, 0]);
  });
  it('dos tarjetas de la misma unidad borran un solo ítem', () => {
    expect(indicesABorrar(items, ['c', 'c'], esDe)).toEqual([2]);
  });
  it('una tarjeta sin ítem no borra nada', () => {
    expect(indicesABorrar(items, ['z'], esDe)).toEqual([]);
  });
  it('borrar en ese orden deja exactamente los no marcados', () => {
    const copia = [...items];
    for (const i of indicesABorrar(copia, ['a', 'c'], esDe)) copia.splice(i, 1);
    expect(copia).toEqual([{ id: 'b' }, { id: 'd' }]);
  });
});
