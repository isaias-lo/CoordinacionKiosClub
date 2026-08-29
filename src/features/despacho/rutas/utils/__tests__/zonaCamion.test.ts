import { describe, it, expect } from 'vitest';
import { zonaDeCamion, zonasDeCamion, etiquetaCamion, avisosCamionNoHabilitado } from '../zonaCamion';
import type { ConfigZonas } from '../zonasTransporte';
import type { TiendaInfo } from '../../data/tiendas';

// CD en Santiago; norte = latitud >= latCD (menos negativa), sur = más al sur.
const latCD = -33.412581;
const T = (sector: string): TiendaInfo => ({ n: '', z: '', v: '', sector } as unknown as TiendaInfo);

// Las 17 tiendas de Regiones tienen sector 'Región' a secas: la zona sale de la LATITUD (gps).
const tiendas: Record<string, TiendaInfo> = {
  '51SER': T('Región'),          // La Serena — norte
  '41ANA': T('Región'),          // Antofagasta — norte
  '40LIL': T('Región'),          // sur
  '01TPS': T('Corredor Oriente'),// santiago
  'COSTA': T('Costa'),           // costa
};
const gps: Record<string, number[]> = {
  '51SER': [-29.9,  -71.25],   // norte
  '41ANA': [-23.65, -70.40],   // norte
  '40LIL': [-38.0,  -72.3],    // sur
  '01TPS': [-33.40, -70.55],   // santiago
  'COSTA': [-33.02, -71.55],   // costa
};

const cfg: ConfigZonas = {
  santiago: { zona: 'santiago', modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 4, activo: true },
  costa:    { zona: 'costa',    modo: 'ruta',          empresas: ['Luis Fica'],              orden: 3, activo: true },
  sur:      { zona: 'sur',      modo: 'consolidacion', empresas: ['Luis Fica'],              orden: 1, activo: true },
  norte:    { zona: 'norte',    modo: 'consolidacion', empresas: ['Falabella'],              orden: 2, activo: true },
};

describe('zonaDeCamion — regiones norte por latitud (corrección 1)', () => {
  it("'Región' a secas del NORTE (51SER, 41ANA) → norte, no sur", () => {
    expect(zonaDeCamion([{ c: '51SER' }], tiendas, gps, latCD)).toBe('norte');
    expect(zonaDeCamion([{ c: '41ANA' }], tiendas, gps, latCD)).toBe('norte');
    expect(zonaDeCamion([{ c: '51SER' }, { c: '41ANA' }], tiendas, gps, latCD)).toBe('norte');
  });
  it("'Región' a secas del SUR → sur", () => {
    expect(zonaDeCamion([{ c: '40LIL' }], tiendas, gps, latCD)).toBe('sur');
  });
  it('Santiago y Costa por sector', () => {
    expect(zonaDeCamion([{ c: '01TPS' }], tiendas, gps, latCD)).toBe('santiago');
    expect(zonaDeCamion([{ c: 'COSTA' }], tiendas, gps, latCD)).toBe('costa');
  });
  it('sin tiendas → null', () => {
    expect(zonaDeCamion([], tiendas, gps, latCD)).toBeNull();
  });
});

describe('zonaDeCamion — desempate ESTABLE por orden (corrección 3)', () => {
  it('mismo empate da el mismo resultado sin importar el orden de las tiendas', () => {
    // 1 Santiago (orden 4) + 1 Costa (orden 3): empate 1-1 → gana menor orden = costa.
    const a = zonaDeCamion([{ c: '01TPS' }, { c: 'COSTA' }], tiendas, gps, latCD, cfg);
    const b = zonaDeCamion([{ c: 'COSTA' }, { c: '01TPS' }], tiendas, gps, latCD, cfg);
    expect(a).toBe(b);
    expect(a).toBe('costa'); // costa.orden(3) < santiago.orden(4)
  });
  it('con norte y sur empatados gana sur (orden 1 < norte 2)', () => {
    const a = zonaDeCamion([{ c: '51SER' }, { c: '40LIL' }], tiendas, gps, latCD, cfg);
    const b = zonaDeCamion([{ c: '40LIL' }, { c: '51SER' }], tiendas, gps, latCD, cfg);
    expect(a).toBe(b);
    expect(a).toBe('sur');
  });
});

describe('etiquetaCamion', () => {
  it('norte → "Norte · consolidación" (según config)', () => {
    expect(etiquetaCamion([{ c: '51SER' }], tiendas, gps, latCD, cfg)?.label).toBe('Norte · consolidación');
  });
  it('sin config cae al default (norte/sur consolidan, santiago rutea)', () => {
    expect(etiquetaCamion([{ c: '51SER' }], tiendas, gps, latCD)?.modo).toBe('consolidacion');
    expect(etiquetaCamion([{ c: '01TPS' }], tiendas, gps, latCD)?.modo).toBe('ruta');
  });
});

describe('avisosCamionNoHabilitado', () => {
  it('correción 1: Falabella con La Serena (norte) NO da aviso (Falabella cubre norte)', () => {
    expect(avisosCamionNoHabilitado('AB1234', 'Falabella', [{ c: '51SER' }], tiendas, gps, latCD, cfg)).toEqual([]);
  });
  it('empresa no habilitada para la zona → aviso con el formato del motor', () => {
    // Sur habilita solo Luis Fica; un camión de Falabella al sur no está habilitado.
    expect(avisosCamionNoHabilitado('AB1234', 'Falabella', [{ c: '40LIL' }], tiendas, gps, latCD, cfg))
      .toEqual(['AB1234 (Falabella) no está habilitado para Sur']);
  });
  it('corrección 4: camión con sur Y norte avisa por CADA zona no habilitada', () => {
    // Luis Fica: habilitado en sur, NO en norte → aviso solo por Norte.
    expect(avisosCamionNoHabilitado('AB1234', 'Luis Fica', [{ c: '40LIL' }, { c: '51SER' }], tiendas, gps, latCD, cfg))
      .toEqual(['AB1234 (Luis Fica) no está habilitado para Norte']);
    // Una empresa que no cubre ninguna de las dos → dos avisos (orden estable: sur, norte).
    expect(avisosCamionNoHabilitado('AB1234', 'Ortiz', [{ c: '40LIL' }, { c: '51SER' }], tiendas, gps, latCD, cfg))
      .toEqual([
        'AB1234 (Ortiz) no está habilitado para Sur',
        'AB1234 (Ortiz) no está habilitado para Norte',
      ]);
  });
  it('empresa vacía → "sin empresa"; sin config → sin avisos', () => {
    expect(avisosCamionNoHabilitado('AB1234', '', [{ c: '40LIL' }], tiendas, gps, latCD, cfg))
      .toEqual(['AB1234 (sin empresa) no está habilitado para Sur']);
    expect(avisosCamionNoHabilitado('AB1234', 'X', [{ c: '40LIL' }], tiendas, gps, latCD, undefined)).toEqual([]);
  });
  it('zona inactiva no molesta', () => {
    const cfgInact: ConfigZonas = { ...cfg, norte: { ...cfg.norte, activo: false } };
    expect(avisosCamionNoHabilitado('AB1234', 'X', [{ c: '51SER' }], tiendas, gps, latCD, cfgInact)).toEqual([]);
  });
});

describe('zonasDeCamion', () => {
  it('lista las zonas distintas ordenadas por orden', () => {
    expect(zonasDeCamion([{ c: '01TPS' }, { c: '40LIL' }, { c: '51SER' }], tiendas, gps, latCD, cfg))
      .toEqual(['sur', 'norte', 'santiago']); // orden 1, 2, 4
  });
});
