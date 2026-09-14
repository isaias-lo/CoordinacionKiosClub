import { describe, it, expect } from 'vitest';
import { esVehiculoDePrueba } from '../vehiculoPrueba';

describe('esVehiculoDePrueba', () => {
  it('el registro real de la flota: patente PRUEBA, empresa Prueba', () => {
    expect(esVehiculoDePrueba('PRUEBA', 'Prueba')).toBe(true);
  });

  it('basta con que UNO de los dos campos lo diga', () => {
    expect(esVehiculoDePrueba('PRUEBA', '')).toBe(true);
    expect(esVehiculoDePrueba('ABCD12', 'Prueba')).toBe(true);
  });

  it('los numerados también: al ensayar se crean varios', () => {
    expect(esVehiculoDePrueba('PRUEBA 1', '')).toBe(true);
    expect(esVehiculoDePrueba('', 'Prueba 2')).toBe(true);
  });

  it('no importan mayúsculas, espacios ni acentos', () => {
    expect(esVehiculoDePrueba('  prueba  ', '')).toBe(true);
    expect(esVehiculoDePrueba('Prüeba', '')).toBe(true);
  });

  it('también "test"', () => {
    expect(esVehiculoDePrueba('TEST', '')).toBe(true);
    expect(esVehiculoDePrueba('', 'Test 3')).toBe(true);
  });

  it('los camiones REALES de la flota no se marcan', () => {
    for (const [p, e] of [['TYKK42','Luis Fica'], ['VSDR91','Luis Fica'], ['PKZW16','Kios Club'], ['PTFZ21','Luis Fica']]) {
      expect(esVehiculoDePrueba(p, e)).toBe(false);
    }
  });

  it('la palabra tiene que ABRIR el campo, no aparecer al pasar', () => {
    expect(esVehiculoDePrueba('', 'Transportes Prueba Ltda')).toBe(false);
    expect(esVehiculoDePrueba('ABPRUEBA1', '')).toBe(false);
  });

  it('vacío, null y undefined no marcan nada', () => {
    expect(esVehiculoDePrueba('', '')).toBe(false);
    expect(esVehiculoDePrueba(null, undefined)).toBe(false);
    expect(esVehiculoDePrueba()).toBe(false);
  });
});
