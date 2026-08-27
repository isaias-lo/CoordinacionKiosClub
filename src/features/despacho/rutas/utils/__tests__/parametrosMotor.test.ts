import { describe, it, expect } from 'vitest';
import {
  parseParametros, serializarParametros, aOpcionesMotor, minutosAHHMM,
  PARAMETROS_DEFAULT, CLAVES, type ParametrosMotor,
} from '../parametrosMotor';

describe('minutosAHHMM', () => {
  it('convierte minutos a HH:MM', () => {
    expect(minutosAHHMM(900)).toBe('15:00');
    expect(minutosAHHMM(930)).toBe('15:30');
    expect(minutosAHHMM(0)).toBe('00:00');
    expect(minutosAHHMM(8 * 60)).toBe('08:00');
  });
  it('acota fuera de rango dentro del día', () => {
    expect(minutosAHHMM(1440)).toBe('00:00');
    expect(minutosAHHMM(-30)).toBe('23:30');
  });
});

describe('parseParametros', () => {
  it('objeto vacío → defaults', () => {
    expect(parseParametros({})).toEqual(PARAMETROS_DEFAULT);
    expect(parseParametros()).toEqual(PARAMETROS_DEFAULT);
  });

  it('lee valores válidos, con corteCierre en HH:MM → minutos', () => {
    const raw = {
      [CLAVES.maxDiametroKm]: '25',
      [CLAVES.velocidadKmH]: '30',
      [CLAVES.minutosPorParada]: '10',
      [CLAVES.horaSalida]: '07:30',
      [CLAVES.corteCierre]: '15:30',
      [CLAVES.silencioMin]: '60',
    };
    expect(parseParametros(raw)).toEqual({
      maxDiametroKm: 25, velocidadKmH: 30, minutosPorParada: 10,
      horaSalida: '07:30', corteCierre: 930, silencioMin: 60,
    });
  });

  it('basura o negativos → default (excepto maxDiametroKm que admite 0)', () => {
    const raw = {
      [CLAVES.maxDiametroKm]: '0',       // válido (sin límite)
      [CLAVES.velocidadKmH]: 'abc',      // → default
      [CLAVES.minutosPorParada]: '-5',   // → default
      [CLAVES.horaSalida]: '25:00',      // inválida → default
      [CLAVES.corteCierre]: 'tarde',     // → default
      [CLAVES.silencioMin]: '0',         // no positivo → default
    };
    const p = parseParametros(raw);
    expect(p.maxDiametroKm).toBe(0);
    expect(p.velocidadKmH).toBe(PARAMETROS_DEFAULT.velocidadKmH);
    expect(p.minutosPorParada).toBe(PARAMETROS_DEFAULT.minutosPorParada);
    expect(p.horaSalida).toBe(PARAMETROS_DEFAULT.horaSalida);
    expect(p.corteCierre).toBe(PARAMETROS_DEFAULT.corteCierre);
    expect(p.silencioMin).toBe(PARAMETROS_DEFAULT.silencioMin);
  });

  it('roundtrip serializar→parse es estable', () => {
    const p: ParametrosMotor = {
      maxDiametroKm: 18, velocidadKmH: 24, minutosPorParada: 15,
      horaSalida: '08:15', corteCierre: 16 * 60, silencioMin: 45,
    };
    const raw: Record<string, string> = {};
    for (const { clave, valor } of serializarParametros(p)) raw[clave] = valor;
    expect(parseParametros(raw)).toEqual(p);
  });
});

describe('serializarParametros', () => {
  it('emite las seis claves, con corteCierre como HH:MM', () => {
    const pares = serializarParametros(PARAMETROS_DEFAULT);
    const map = Object.fromEntries(pares.map(x => [x.clave, x.valor]));
    expect(Object.keys(map).sort()).toEqual(Object.values(CLAVES).sort());
    expect(map[CLAVES.corteCierre]).toBe(minutosAHHMM(PARAMETROS_DEFAULT.corteCierre));
  });
});

describe('aOpcionesMotor', () => {
  it('mapea los seis campos a las opciones del motor', () => {
    const p: ParametrosMotor = {
      maxDiametroKm: 20, velocidadKmH: 22, minutosPorParada: 12,
      horaSalida: '08:00', corteCierre: 900, silencioMin: 90,
    };
    expect(aOpcionesMotor(p)).toEqual({
      maxDiametroKm: 20, velocidadKmH: 22, minutosPorParada: 12,
      horaSalida: '08:00', corteCierre: 900, silencioMin: 90,
    });
  });
});
