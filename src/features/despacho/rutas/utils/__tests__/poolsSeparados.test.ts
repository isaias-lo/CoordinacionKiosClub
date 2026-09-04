import { describe, it, expect } from 'vitest';
import {
  poolDeGrupo, enPool, grupoIndefinido, codsDePool, flotaDePool, camionesExtra,
} from '../poolsSeparados';
import { ZONAS_DEFAULT, type ConfigZonas } from '../zonasTransporte';
import type { Vehiculo } from '../../data/flota';

const v = (p: string, empresa: string): Vehiculo => ({
  p, c: 10, b: 0, t: 'camion', tlbd: false, on: true,
  porton: null, refrigerado: false, empresa,
});

describe('poolDeGrupo', () => {
  it('Regiones (fal) va a su propio pool', () => {
    expect(poolDeGrupo('fal')).toBe('regiones');
  });
  it('RM y Costa comparten pool', () => {
    expect(poolDeGrupo('rm')).toBe('rm-costa');
    expect(poolDeGrupo('costa')).toBe('rm-costa');
  });

  // El punto: mostrar y registrar tienen que coincidir. `tablaDeGrupo` manda a despacho_rm todo
  // lo que no sea 'fal', así que un grupo desconocido DEBE verse en RM/Costa. Antes el orden del
  // pool lo trataba como Regiones y el registro como RM.
  it('un grupo desconocido cae donde se va a registrar (RM/Costa)', () => {
    expect(poolDeGrupo(undefined)).toBe('rm-costa');
    expect(poolDeGrupo('manual')).toBe('rm-costa');
    expect(poolDeGrupo('pendiente')).toBe('rm-costa');
  });
});

describe('grupoIndefinido', () => {
  it('marca lo que no es rm/costa/fal', () => {
    expect(grupoIndefinido(undefined)).toBe(true);
    expect(grupoIndefinido('')).toBe(true);
    expect(grupoIndefinido('manual')).toBe(true);
  });
  it('no marca los grupos reales', () => {
    for (const g of ['rm', 'costa', 'fal']) expect(grupoIndefinido(g)).toBe(false);
  });
});

describe('codsDePool', () => {
  const calT = {
    '40LIL': { g: 'rm' },
    '37VIÑ': { g: 'costa' },
    '57CAS': { g: 'fal' },
    '28TEM': { g: 'fal' },
    '99XXX': { g: undefined },
  };

  it('separa los dos pools', () => {
    expect(codsDePool(calT, 'regiones').sort()).toEqual(['28TEM', '57CAS']);
    expect(codsDePool(calT, 'rm-costa').sort()).toEqual(['37VIÑ', '40LIL', '99XXX']);
  });

  it('ninguna tienda se pierde entre los dos pools', () => {
    const total = [...codsDePool(calT, 'regiones'), ...codsDePool(calT, 'rm-costa')];
    expect(total.sort()).toEqual(Object.keys(calT).sort());
  });

  it('ninguna tienda aparece en los dos a la vez', () => {
    const a = new Set(codsDePool(calT, 'regiones'));
    expect(codsDePool(calT, 'rm-costa').some(c => a.has(c))).toBe(false);
  });
});

describe('flotaDePool — la config de Transportistas decide qué camiones se ofrecen', () => {
  const flota = [v('AB-1', 'Luis Fica'), v('CD-2', 'Falabella'), v('EF-3', 'Kios Club')];

  it('sin config, se ofrece toda la flota (no dejar al coordinador sin camiones)', () => {
    expect(flotaDePool(flota, 'regiones', undefined)).toHaveLength(3);
  });

  it('con config, cada pool ofrece solo las empresas habilitadas para sus zonas', () => {
    const cfg: ConfigZonas = {
      ...ZONAS_DEFAULT,
      sur:      { ...ZONAS_DEFAULT.sur,      empresas: ['Luis Fica'] },
      norte:    { ...ZONAS_DEFAULT.norte,    empresas: ['Falabella'] },
      santiago: { ...ZONAS_DEFAULT.santiago, empresas: ['Kios Club'] },
      costa:    { ...ZONAS_DEFAULT.costa,    empresas: ['Kios Club'] },
    };
    // Regiones = sur + norte → Luis Fica y Falabella
    expect(flotaDePool(flota, 'regiones', cfg).map(x => x.p).sort()).toEqual(['AB-1', 'CD-2']);
    // RM/Costa = santiago + costa → Kios Club
    expect(flotaDePool(flota, 'rm-costa', cfg).map(x => x.p)).toEqual(['EF-3']);
  });

  it('una zona sin empresas no ofrece camiones de esa zona', () => {
    const cfg: ConfigZonas = {
      ...ZONAS_DEFAULT,
      santiago: { ...ZONAS_DEFAULT.santiago, empresas: [] },
      costa:    { ...ZONAS_DEFAULT.costa,    empresas: [] },
    };
    expect(flotaDePool(flota, 'rm-costa', cfg)).toEqual([]);
  });
});

describe('camionesExtra — el camión excepcional no se esconde', () => {
  const flota = [v('AB-1', 'Luis Fica'), v('CD-2', 'Falabella')];
  const ofrecidos = [v('AB-1', 'Luis Fica')];

  it('un camión de otra empresa YA cargado se sigue mostrando', () => {
    const out = camionesExtra(flota, ofrecidos, { 'CD-2': [{ c: '40LIL' }] });
    expect(out.map(x => x.p)).toEqual(['CD-2']);
  });

  it('un camión de otra empresa sin carga no ensucia la vista', () => {
    expect(camionesExtra(flota, ofrecidos, {})).toEqual([]);
    expect(camionesExtra(flota, ofrecidos, { 'CD-2': [] })).toEqual([]);
  });

  it('no duplica los que el pool ya ofrece', () => {
    expect(camionesExtra(flota, ofrecidos, { 'AB-1': [{ c: '40LIL' }] })).toEqual([]);
  });
});

describe('enPool', () => {
  it('es coherente con poolDeGrupo', () => {
    for (const g of ['rm', 'costa', 'fal', undefined, 'manual']) {
      expect(enPool(g, poolDeGrupo(g))).toBe(true);
      expect(enPool(g, poolDeGrupo(g) === 'regiones' ? 'rm-costa' : 'regiones')).toBe(false);
    }
  });
});
