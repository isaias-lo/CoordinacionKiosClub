import { describe, it, expect } from 'vitest';
import { leerPreferencia, estaPlegado, alternar, ANCHO_ESCRITORIO } from '../plegadoCruce';

describe('plegadoCruce', () => {
  it('solo acepta los dos valores guardables', () => {
    expect(leerPreferencia('abierto')).toBe('abierto');
    expect(leerPreferencia('plegado')).toBe('plegado');
    expect(leerPreferencia(null)).toBeNull();
    expect(leerPreferencia('true')).toBeNull();
    expect(leerPreferencia('')).toBeNull();
  });

  it('sin elegir, manda el ancho: plegado en teléfono, abierto en escritorio', () => {
    expect(estaPlegado(null, 390)).toBe(true);
    expect(estaPlegado(null, ANCHO_ESCRITORIO - 1)).toBe(true);
    expect(estaPlegado(null, ANCHO_ESCRITORIO)).toBe(false);
    expect(estaPlegado(null, 1440)).toBe(false);
  });

  it('lo elegido gana sobre el ancho', () => {
    expect(estaPlegado('abierto', 390)).toBe(false);
    expect(estaPlegado('plegado', 1440)).toBe(true);
  });

  it('tocar deja elegido lo contrario de lo que se ve', () => {
    expect(alternar(null, 390)).toBe('abierto');
    expect(alternar(null, 1440)).toBe('plegado');
    expect(alternar('abierto', 390)).toBe('plegado');
    expect(alternar('plegado', 1440)).toBe('abierto');
  });
});
