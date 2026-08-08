import { describe, it, expect } from 'vitest';
import { tipoCodeSantiago, pkgCodeNacional } from '../tipoCode';

describe('tipoCodeSantiago', () => {
  it('mapea cada tipo a su letra', () => {
    expect(tipoCodeSantiago('Pallet')).toBe('P');
    expect(tipoCodeSantiago('Bulto')).toBe('B');
    expect(tipoCodeSantiago('Contenedor')).toBe('C');
    expect(tipoCodeSantiago('Chocolate')).toBe('CH');
  });
  it('desconocido → P (pallet) por defecto', () => {
    expect(tipoCodeSantiago('otro')).toBe('P');
  });
});

describe('pkgCodeNacional', () => {
  it('mapea cada pkg a su letra', () => {
    expect(pkgCodeNacional('pallet')).toBe('P');
    expect(pkgCodeNacional('box')).toBe('B');
    expect(pkgCodeNacional('contenedor')).toBe('C');
    expect(pkgCodeNacional('chocolate')).toBe('CH');
  });
  it('desconocido → P por defecto', () => {
    expect(pkgCodeNacional('x')).toBe('P');
  });
});
