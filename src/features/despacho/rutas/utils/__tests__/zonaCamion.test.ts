import { describe, it, expect } from 'vitest';
import { zonaDeCamion, etiquetaCamion, avisoCamionNoHabilitado } from '../zonaCamion';
import type { ConfigZonas } from '../zonasTransporte';
import type { TiendaInfo } from '../../data/tiendas';

// Tiendas mínimas con `sector` (lo único que mira la zona). El cast cubre el campo opcional.
const T = (sector: string): TiendaInfo => ({ n: '', z: '', v: '', sector } as unknown as TiendaInfo);
const tiendas: Record<string, TiendaInfo> = {
  STGO1: T('Corredor Oriente'),   // santiago
  STGO2: T('Corredor Poniente'),  // santiago
  SUR1:  T('Región Sur'),         // sur
  SUR2:  T('Región'),             // 'Región' a secas → sur
  NORTE1:T('Región Norte'),       // norte
  COSTA1:T('Costa'),              // costa
  VACIO: T(''),               // sector vacío → null (sin zona)
};

const cfg: ConfigZonas = {
  santiago: { zona: 'santiago', modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 4, activo: true },
  costa:    { zona: 'costa',    modo: 'ruta',          empresas: ['Luis Fica'],              orden: 3, activo: true },
  sur:      { zona: 'sur',      modo: 'consolidacion', empresas: ['Falabella'],              orden: 1, activo: true },
  norte:    { zona: 'norte',    modo: 'consolidacion', empresas: [],                         orden: 2, activo: false },
};

describe('zonaDeCamion', () => {
  it('todas Santiago → santiago', () => {
    expect(zonaDeCamion([{ c: 'STGO1' }, { c: 'STGO2' }], tiendas)).toBe('santiago');
  });
  it("'Región' a secas cuenta como sur", () => {
    expect(zonaDeCamion([{ c: 'SUR2' }], tiendas)).toBe('sur');
  });
  it('mezcla → zona dominante', () => {
    expect(zonaDeCamion([{ c: 'SUR1' }, { c: 'SUR2' }, { c: 'STGO1' }], tiendas)).toBe('sur');
  });
  it('sin tiendas o sin zona conocida → null', () => {
    expect(zonaDeCamion([], tiendas)).toBeNull();
    expect(zonaDeCamion([{ c: 'VACIO' }], tiendas)).toBeNull();
  });
});

describe('etiquetaCamion', () => {
  it('usa el modo de la config: Santiago·ruta, Sur·consolidación', () => {
    expect(etiquetaCamion([{ c: 'STGO1' }], tiendas, cfg)?.label).toBe('Santiago · ruta');
    expect(etiquetaCamion([{ c: 'SUR1' }], tiendas, cfg)?.label).toBe('Sur · consolidación');
  });
  it('sin config cae al default geográfico (sur/norte consolidan)', () => {
    expect(etiquetaCamion([{ c: 'SUR1' }], tiendas)?.modo).toBe('consolidacion');
    expect(etiquetaCamion([{ c: 'STGO1' }], tiendas)?.modo).toBe('ruta');
  });
  it('camión sin zona → null', () => {
    expect(etiquetaCamion([{ c: 'VACIO' }], tiendas, cfg)).toBeNull();
  });
});

describe('avisoCamionNoHabilitado', () => {
  it('empresa NO habilitada para la zona → aviso con el formato del motor', () => {
    // Sur solo habilita Falabella; un camión de Luis Fica no está habilitado.
    expect(avisoCamionNoHabilitado('AB1234', 'Luis Fica', [{ c: 'SUR1' }], tiendas, cfg))
      .toBe('AB1234 (Luis Fica) no está habilitado para Sur');
  });
  it('empresa habilitada → null (compara por empresa canónica)', () => {
    expect(avisoCamionNoHabilitado('AB1234', 'Kios', [{ c: 'STGO1' }], tiendas, cfg)).toBeNull();
    expect(avisoCamionNoHabilitado('AB1234', 'Falabella', [{ c: 'SUR1' }], tiendas, cfg)).toBeNull();
  });
  it('empresa vacía → "sin empresa"', () => {
    expect(avisoCamionNoHabilitado('AB1234', '', [{ c: 'SUR1' }], tiendas, cfg))
      .toBe('AB1234 (sin empresa) no está habilitado para Sur');
  });
  it('zona inactiva o sin config o sin zona → null (no molesta)', () => {
    expect(avisoCamionNoHabilitado('AB1234', 'X', [{ c: 'NORTE1' }], tiendas, cfg)).toBeNull(); // norte inactivo
    expect(avisoCamionNoHabilitado('AB1234', 'X', [{ c: 'SUR1' }], tiendas, undefined)).toBeNull();
    expect(avisoCamionNoHabilitado('AB1234', 'X', [{ c: 'VACIO' }], tiendas, cfg)).toBeNull();
  });
});
