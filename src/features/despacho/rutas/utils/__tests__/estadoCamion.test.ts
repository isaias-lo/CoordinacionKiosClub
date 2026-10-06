import { describe, it, expect } from 'vitest';
import { estadoCamion } from '../estadoCamion';
import { excesoDe } from '../sobreCapacidad';

describe('estadoCamion', () => {
  it('cerrado manda sobre todo, aunque vaya pasado', () => {
    expect(estadoCamion({ cerrado: true, exceso: excesoDe(11, 10), tiendas: 4 })).toEqual({ texto: '✓ Cerrado', tono: 'cerrado' });
  });
  it('pasado de capacidad dice cuántos sobran', () => {
    expect(estadoCamion({ cerrado: false, exceso: excesoDe(12, 10), tiendas: 4 })).toEqual({ texto: 'Lleva 2 de más', tono: 'exceso' });
  });
  it('con tiendas y sin cerrar, armando; sin tiendas, vacío', () => {
    expect(estadoCamion({ cerrado: false, exceso: null, tiendas: 2 }).tono).toBe('armando');
    expect(estadoCamion({ cerrado: false, exceso: null, tiendas: 0 }).tono).toBe('vacio');
  });
});
