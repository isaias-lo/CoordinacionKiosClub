import { describe, it, expect } from 'vitest';
import {
  ZONAS_DEFAULT, parseZonas, empresaHabilitada, zonasDeRuteo, zonasDeConsolidacion,
  type ConfigZonas,
} from '../zonasTransporte';

describe('ZONAS_DEFAULT', () => {
  it('refleja el estado del 29/08: el sur está repartido entre Luis Fica y Falabella', () => {
    expect(ZONAS_DEFAULT.sur.empresas).toEqual(['Luis Fica', 'Falabella']);
    expect(ZONAS_DEFAULT.norte.empresas).toEqual(['Falabella', 'Ortiz']);
  });
  it('Santiago y Costa se rutean; sur y norte se consolidan', () => {
    expect(ZONAS_DEFAULT.santiago.modo).toBe('ruta');
    expect(ZONAS_DEFAULT.costa.modo).toBe('ruta');
    expect(ZONAS_DEFAULT.sur.modo).toBe('consolidacion');
    expect(ZONAS_DEFAULT.norte.modo).toBe('consolidacion');
  });
  it('lo más lejano se arma primero', () => {
    expect(ZONAS_DEFAULT.sur.orden).toBeLessThan(ZONAS_DEFAULT.costa.orden);
    expect(ZONAS_DEFAULT.costa.orden).toBeLessThan(ZONAS_DEFAULT.santiago.orden);
  });
});

describe('parseZonas', () => {
  it('toma lo que viene de la BD', () => {
    const c = parseZonas([{ zona: 'sur', modo: 'consolidacion', empresas: ['Luis Fica'], orden: 1, activo: true }]);
    expect(c.sur.empresas).toEqual(['Luis Fica']);
  });
  it('completa con el default lo que falte, para que el motor nunca quede sin config', () => {
    const c = parseZonas([{ zona: 'sur', empresas: ['Luis Fica'] }]);
    expect(c.sur.modo).toBe('consolidacion');
    expect(c.santiago).toEqual(ZONAS_DEFAULT.santiago);
  });
  it('con basura devuelve el default entero', () => {
    for (const x of [null, undefined, 'nada', 42, {}]) expect(parseZonas(x)).toEqual(ZONAS_DEFAULT);
  });
  it('ignora zonas desconocidas', () => {
    expect(parseZonas([{ zona: 'marte', empresas: ['X'] }])).toEqual(ZONAS_DEFAULT);
  });
  it('limpia nombres de empresa vacíos', () => {
    expect(parseZonas([{ zona: 'sur', empresas: ['  Ortiz  ', '', '   '] }]).sur.empresas).toEqual(['Ortiz']);
  });
});

describe('empresaHabilitada', () => {
  const sur = ZONAS_DEFAULT.sur;
  it('reconoce las empresas habilitadas', () => {
    expect(empresaHabilitada('Luis Fica', sur)).toBe(true);
    expect(empresaHabilitada('Falabella', sur)).toBe(true);
  });
  it('rechaza las que no lo están', () => {
    expect(empresaHabilitada('Ortiz', sur)).toBe(false);
    expect(empresaHabilitada('Kios Club', sur)).toBe(false);
  });
  it('normaliza las variantes de nombre', () => {
    const z = { ...sur, empresas: ['Kios Club'] };
    for (const v of ['kios', 'Kios', 'KIOSCLUB', '  kios club  '])
      expect(empresaHabilitada(v, z)).toBe(true);
  });
  it('sin empresas configuradas no habilita a nadie', () => {
    // Deliberado: la salida segura el día del traspaso es "asignar a mano".
    const vacia = { ...sur, empresas: [] };
    expect(empresaHabilitada('Luis Fica', vacia)).toBe(false);
  });
  it('camión sin empresa no pasa', () => {
    expect(empresaHabilitada('', sur)).toBe(false);
    expect(empresaHabilitada(null, sur)).toBe(false);
  });
});

describe('zonasDeRuteo / zonasDeConsolidacion', () => {
  it('separan por modo y ordenan por cercanía inversa', () => {
    expect(zonasDeRuteo(ZONAS_DEFAULT).map(z => z.zona)).toEqual(['costa', 'santiago']);
    expect(zonasDeConsolidacion(ZONAS_DEFAULT).map(z => z.zona)).toEqual(['sur', 'norte']);
  });
  it('omiten las zonas inactivas', () => {
    const cfg: ConfigZonas = { ...ZONAS_DEFAULT, costa: { ...ZONAS_DEFAULT.costa, activo: false } };
    expect(zonasDeRuteo(cfg).map(z => z.zona)).toEqual(['santiago']);
  });
  it('una zona puede pasar de consolidación a ruta sin tocar código', () => {
    // Es lo que pasaría si algún día la Ruta Sur se planificara de verdad.
    const cfg: ConfigZonas = { ...ZONAS_DEFAULT, sur: { ...ZONAS_DEFAULT.sur, modo: 'ruta' } };
    expect(zonasDeRuteo(cfg).map(z => z.zona)).toEqual(['sur', 'costa', 'santiago']);
    expect(zonasDeConsolidacion(cfg).map(z => z.zona)).toEqual(['norte']);
  });
});
