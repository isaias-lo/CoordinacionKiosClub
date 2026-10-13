import { describe, it, expect } from 'vitest';
import { unidadAQuitar, esProvisoria } from '../quitarUnidad';

describe('el «−» con un alta todavía en camino', () => {
  it('si la última está guardada, se borra como siempre', () => {
    expect(unidadAQuitar([{ id: 10 }, { id: 11 }])).toEqual({ tipo: 'borrar', slot: { id: 11 } });
  });
  it('si la última es provisoria, se cancela el alta en vez de borrar un id que no existe', () => {
    expect(unidadAQuitar([{ id: 10 }, { id: -3 }])).toEqual({ tipo: 'cancelar-alta', slot: { id: -3 } });
  });
  it('sin unidades no hace nada', () => {
    expect(unidadAQuitar([])).toEqual({ tipo: 'nada' });
  });
  it('provisoria = id negativo', () => {
    expect(esProvisoria({ id: -1 })).toBe(true);
    expect(esProvisoria({ id: 1 })).toBe(false);
  });
});
