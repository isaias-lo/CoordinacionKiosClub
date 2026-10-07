import { describe, it, expect } from 'vitest';
import { estadoParadaPlan, resumenRutaPlan } from '../filaPlan';

const h = (hh: number, mm = 0) => hh * 60 + mm;

describe('estadoParadaPlan', () => {
  it('sin ETA no dice nada', () => {
    expect(estadoParadaPlan(null, '08:30-09:30')).toEqual({ texto: '—', tono: 'neutro' });
  });
  it('dentro de la ventana', () => {
    expect(estadoParadaPlan(h(8, 40), '08:30-09:30')).toEqual({ texto: 'A tiempo', tono: 'ok' });
  });
  it('después de cerrar dice cuántos minutos tarde', () => {
    expect(estadoParadaPlan(h(9, 45), '08:30-09:30')).toEqual({ texto: 'Tarde 15 min', tono: 'tarde' });
  });
  it('antes de abrir dice cuánto espera', () => {
    expect(estadoParadaPlan(h(8, 20), '08:30-09:30')).toEqual({ texto: 'Espera 10 min', tono: 'espera' });
  });
  it('sin ventana', () => {
    expect(estadoParadaPlan(h(10), '')).toEqual({ texto: 'Sin horario', tono: 'neutro' });
  });
});

describe('resumenRutaPlan', () => {
  it('tiendas y km', () => {
    expect(resumenRutaPlan(6, '~58 km')).toBe('6 tiendas · ~58 km');
    expect(resumenRutaPlan(1, '')).toBe('1 tienda');
    expect(resumenRutaPlan(0, '')).toBe('vacía');
  });
});
