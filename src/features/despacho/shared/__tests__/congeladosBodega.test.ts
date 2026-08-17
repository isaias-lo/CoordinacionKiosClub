import { describe, it, expect } from 'vitest';
import { esCongeladoContenido } from '../congeladosBodega';

describe('esCongeladoContenido', () => {
  it('detecta "congelados" en minúscula', () => {
    expect(esCongeladoContenido('congelados')).toBe(true);
  });

  it('detecta "Congelado" con mayúscula inicial', () => {
    expect(esCongeladoContenido('Congelado')).toBe(true);
  });

  it('detecta frases largas que incluyen "congelados"', () => {
    expect(esCongeladoContenido('ABASTECIMIENTO CONGELADOS')).toBe(true);
  });

  it('NO detecta "hogar"', () => {
    expect(esCongeladoContenido('hogar')).toBe(false);
  });

  it('NO detecta "comida"', () => {
    expect(esCongeladoContenido('comida')).toBe(false);
  });

  it('NO detecta string vacío', () => {
    expect(esCongeladoContenido('')).toBe(false);
  });

  it('NO detecta null', () => {
    expect(esCongeladoContenido(null)).toBe(false);
  });

  it('NO detecta undefined', () => {
    expect(esCongeladoContenido(undefined)).toBe(false);
  });
});
