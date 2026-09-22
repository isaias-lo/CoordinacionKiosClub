import { describe, it, expect } from 'vitest';
import {
  subtipoDeCaja, etiquetaSubtipo, tieneMedidasFijas, medidasDeCaja,
  MEDIDAS_CAJA_NEGRA, SUBTIPOS_CAJA, claveUnidad, partirClave,
} from '../subtipoCaja';
import { CHOCOLATE_DIMS } from '../chocolate';

describe('leer el subtipo guardado', () => {
  it('reconoce los dos', () => {
    expect(subtipoDeCaja('negra')).toBe('negra');
    expect(subtipoDeCaja('carton')).toBe('carton');
  });

  it('acepta "cartón" con tilde, que es como se escribe en pantalla', () => {
    expect(subtipoDeCaja('cartón')).toBe('carton');
    expect(subtipoDeCaja('  CARTÓN ')).toBe('carton');
  });

  it('lo anterior al cambio se lee como NEGRA', () => {
    // Todos los chocolates viejos recibieron 42 × 80 × 56: eso es una caja negra.
    expect(subtipoDeCaja(null)).toBe('negra');
    expect(subtipoDeCaja(undefined)).toBe('negra');
    expect(subtipoDeCaja('')).toBe('negra');
  });

  it('un valor corrupto no inventa un tercer subtipo', () => {
    expect(SUBTIPOS_CAJA).toContain(subtipoDeCaja('cualquier cosa'));
    expect(subtipoDeCaja(42)).toBe('negra');
  });
});

describe('las medidas: la diferencia entera entre las dos cajas', () => {
  it('la negra tiene medidas fijas', () => {
    expect(tieneMedidasFijas('negra')).toBe(true);
    expect(medidasDeCaja('negra')).toEqual({ alto: 42, largo: 80, ancho: 56 });
  });

  it('la de cartón NO: su tamaño varía, así que no se le piden', () => {
    expect(tieneMedidasFijas('carton')).toBe(false);
    expect(medidasDeCaja('carton')).toBeNull();
  });

  it('las medidas de la negra son las que el sistema ya usaba para el chocolate', () => {
    // Si alguien cambia una de las dos constantes, esto lo atrapa antes que la operación.
    expect(MEDIDAS_CAJA_NEGRA).toEqual({
      alto: CHOCOLATE_DIMS.alto, largo: CHOCOLATE_DIMS.largo, ancho: CHOCOLATE_DIMS.ancho,
    });
  });

  it('devuelve una copia: nadie puede mutar la constante compartida', () => {
    const m = medidasDeCaja('negra')!;
    m.alto = 999;
    expect(MEDIDAS_CAJA_NEGRA.alto).toBe(42);
  });
});

describe('cómo se llaman en pantalla', () => {
  it('con tilde donde corresponde', () => {
    expect(etiquetaSubtipo('negra')).toBe('Caja Negra');
    expect(etiquetaSubtipo('carton')).toBe('Caja Cartón');
  });
});

describe('la clave de conteo: dos botones, un solo tipo en la base', () => {
  it('el chocolate lleva la caja en la clave', () => {
    expect(claveUnidad('CH', 'negra')).toBe('CH:negra');
    expect(claveUnidad('CH', 'carton')).toBe('CH:carton');
  });

  it('un chocolate viejo (sin subtipo) cuenta como negra', () => {
    expect(claveUnidad('CH', null)).toBe('CH:negra');
  });

  it('los demás tipos no se enteran: la clave es el tipo pelado', () => {
    expect(claveUnidad('P')).toBe('P');
    expect(claveUnidad('B', 'carton')).toBe('B');   // el subtipo solo aplica al chocolate
    expect(claveUnidad('C')).toBe('C');
  });

  it('ida y vuelta: la clave se parte en lo que entiende la base', () => {
    expect(partirClave('CH:carton')).toEqual({ tipo: 'CH', subtipo: 'carton' });
    expect(partirClave('CH:negra')).toEqual({ tipo: 'CH', subtipo: 'negra' });
    expect(partirClave('P')).toEqual({ tipo: 'P', subtipo: null });
  });

  it('una clave CH sin caja se parte como negra', () => {
    expect(partirClave('CH')).toEqual({ tipo: 'CH', subtipo: 'negra' });
  });

  it('cada clave sobrevive la ida y la vuelta', () => {
    for (const c of ['P', 'B', 'C', 'CH:negra', 'CH:carton']) {
      const { tipo, subtipo } = partirClave(c);
      expect(claveUnidad(tipo, subtipo)).toBe(c);
    }
  });
});
