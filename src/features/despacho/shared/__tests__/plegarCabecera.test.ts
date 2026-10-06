import { describe, it, expect } from 'vitest';
import { debePlegarse, UMBRAL_PLEGAR, MARGEN_SOBRA } from '../plegarCabecera';

const base = { arriba: 0, sobra: 600, altoCabecera: 120, plegada: false, ocupada: false };

describe('plegar la cabecera de la lista', () => {
  it('arriba de todo se ve', () => {
    expect(debePlegarse(base)).toBe(false);
  });

  it('al bajar más que el umbral se pliega', () => {
    expect(debePlegarse({ ...base, arriba: UMBRAL_PLEGAR + 1 })).toBe(true);
  });

  it('con una lista corta no se pliega: el recorte la volvería a abrir', () => {
    expect(debePlegarse({ ...base, arriba: 100, sobra: 120 + MARGEN_SOBRA })).toBe(false);
  });

  it('plegada, se queda así hasta volver arriba', () => {
    expect(debePlegarse({ ...base, plegada: true, arriba: 30 })).toBe(true);
    expect(debePlegarse({ ...base, plegada: true, arriba: 0 })).toBe(false);
  });

  it('con el buscador en uso nunca se esconde', () => {
    expect(debePlegarse({ ...base, arriba: 300, ocupada: true })).toBe(false);
    expect(debePlegarse({ ...base, arriba: 300, plegada: true, ocupada: true })).toBe(false);
  });
});
