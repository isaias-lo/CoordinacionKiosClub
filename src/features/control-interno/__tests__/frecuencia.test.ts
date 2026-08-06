import { describe, it, expect } from 'vitest';
import { frecuenciaDesdeCalendario, frecuenciasPorTienda } from '../frecuencia';

const cal = {
  LU: { rm: ['18FLO'], costa: [], fal: [] },
  MA: { rm: ['26ALC', '18FLO'], costa: [], fal: [] },
  MI: { rm: [], costa: ['26ALC'], fal: [] }, // ALC también en costa el MI (otro grupo)
  JU: { rm: ['26ALC'], costa: [], fal: [] },
  VI: { rm: ['26ALC'], costa: [], fal: [] },
};

describe('frecuenciaDesdeCalendario', () => {
  it('deriva los días en orden canónico (caso ALC = MA-MI-JU-VI)', () => {
    expect(frecuenciaDesdeCalendario('26ALC', cal)).toBe('MA-MI-JU-VI');
  });
  it('tienda en un solo día', () => {
    expect(frecuenciaDesdeCalendario('18FLO', cal)).toBe('LU-MA');
  });
  it('tienda ausente del calendario → ""', () => {
    expect(frecuenciaDesdeCalendario('99XXX', cal)).toBe('');
  });
  it('cal nulo o cod vacío → ""', () => {
    expect(frecuenciaDesdeCalendario('26ALC', null)).toBe('');
    expect(frecuenciaDesdeCalendario('', cal)).toBe('');
  });
});

describe('frecuenciasPorTienda', () => {
  it('mapea cada tienda a su frecuencia sin duplicar días (multi-grupo)', () => {
    const map = frecuenciasPorTienda(cal);
    expect(map['26ALC']).toBe('MA-MI-JU-VI');
    expect(map['18FLO']).toBe('LU-MA');
  });
});
