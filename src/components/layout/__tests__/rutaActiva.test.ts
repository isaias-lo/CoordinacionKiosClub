import { describe, it, expect } from 'vitest';
import { rutaActiva, calza } from '../rutaActiva';

const MENU = ['/', '/picking', '/despacho', '/despacho/congelados', '/despacho/regiones', '/auditoria'];

describe('rutaActiva', () => {
  it('en Congelados se marca Congelados, NO el Enrutador (m-06)', () => {
    expect(rutaActiva('/despacho/congelados', MENU)).toBe('/despacho/congelados');
  });

  it('en el Enrutador se marca el Enrutador', () => {
    expect(rutaActiva('/despacho', MENU)).toBe('/despacho');
  });

  it('una subruta SIN ítem propio sigue marcando a su sección', () => {
    expect(rutaActiva('/despacho/algo-interno', MENU)).toBe('/despacho');
  });

  it('la raíz solo se marca en la raíz', () => {
    expect(rutaActiva('/', MENU)).toBe('/');
    expect(rutaActiva('/picking', MENU)).toBe('/picking');
  });

  it('una ruta ajena al menú no marca nada', () => {
    expect(rutaActiva('/perfil', MENU)).toBeNull();
  });

  it('sin pathname no marca nada', () => {
    expect(rutaActiva(null, MENU)).toBeNull();
    expect(rutaActiva(undefined, MENU)).toBeNull();
  });

  it('no confunde rutas que solo comparten el comienzo del texto', () => {
    expect(calza('/despachos', '/despacho')).toBe(false);
    expect(rutaActiva('/despachos', MENU)).toBeNull();
  });
});
