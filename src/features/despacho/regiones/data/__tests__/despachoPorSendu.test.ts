import { describe, it, expect } from 'vitest';
import { despachoPorSendu, empresaUsaSendu, EMPRESAS_SENDU } from '../despachoPorSendu';
import type { ConfigZonas } from '@/features/despacho/rutas/utils/zonasTransporte';

// La configuración REAL al 05/09/2026 (tabla `zonas_transporte`): Luis Fica tomó el sur
// completo el 31/08 y a Falabella le queda solo el norte.
const HOY: ConfigZonas = {
  sur:      { zona: 'sur',      modo: 'consolidacion', empresas: ['Luis Fica'],              orden: 1, activo: true },
  norte:    { zona: 'norte',    modo: 'consolidacion', empresas: ['Falabella'],              orden: 2, activo: true },
  costa:    { zona: 'costa',    modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 3, activo: true },
  santiago: { zona: 'santiago', modo: 'ruta',          empresas: ['Luis Fica', 'Kios Club'], orden: 4, activo: true },
};

describe('empresaUsaSendu', () => {
  it('Falabella sí; el resto no', () => {
    expect(empresaUsaSendu('Falabella')).toBe(true);
    expect(empresaUsaSendu('Luis Fica')).toBe(false);
    expect(empresaUsaSendu('Kios Club')).toBe(false);
  });

  it('no depende de mayúsculas ni espacios', () => {
    expect(empresaUsaSendu('  falabella ')).toBe(true);
  });

  it('sin empresa no es Sendu', () => {
    expect(empresaUsaSendu('')).toBe(false);
    expect(empresaUsaSendu(null)).toBe(false);
  });

  it('la regla es una sola y está declarada', () => {
    expect(EMPRESAS_SENDU).toEqual(['Falabella']);
  });
});

describe('despachoPorSendu', () => {
  // El caso que motivó todo: Los Pablos es la única con el sector explícito, va en el sur,
  // y el aviso le pedía datos de Sendu que nadie iba a usar.
  it('60PBL (Región Sur, Luis Fica) NO va por Sendu', () => {
    const r = despachoPorSendu({ sector_comuna: 'Región Sur', lat: -38.748274 }, HOY);
    expect(r.aplica).toBe(false);
    expect(r.zona).toBe('sur');
    expect(r.motivo).toBe('Región Sur la lleva Luis Fica, no Falabella: no se despacha por Sendu.');
  });

  // Las 17 fichas viejas dicen "Región" a secas: la latitud es la que separa norte de sur.
  it('39PSB (La Serena, "Región" a secas) cae en el norte y SÍ va por Sendu', () => {
    const r = despachoPorSendu({ sector_comuna: 'Región', lat: -29.925456 }, HOY);
    expect(r.aplica).toBe(true);
    expect(r.zona).toBe('norte');
    expect(r.motivo).toBe('Región Norte la lleva Falabella: se despacha por Sendu.');
  });

  it('57CAS (Castro, "Región" a secas) cae en el sur y no va por Sendu', () => {
    const r = despachoPorSendu({ sector_comuna: 'Región', lat: -42.4795 }, HOY);
    expect(r.aplica).toBe(false);
    expect(r.zona).toBe('sur');
  });

  // RM y Costa quedan fuera solas, sin necesitar el gate viejo de "¿es Regiones?".
  it('Santiago y Costa no van por Sendu: las lleva camión propio', () => {
    expect(despachoPorSendu({ sector_comuna: 'Las Condes' }, HOY).aplica).toBe(false);
    expect(despachoPorSendu({ sector_comuna: 'Costa' }, HOY).aplica).toBe(false);
  });

  // El punto entero de derivarlo: el día que Luis tome el norte, no se toca ninguna tienda.
  it('si Luis toma el norte, el norte deja de pedir Sendu sin tocar la tienda', () => {
    const manana: ConfigZonas = { ...HOY, norte: { ...HOY.norte, empresas: ['Luis Fica'] } };
    expect(despachoPorSendu({ sector_comuna: 'Región', lat: -29.925456 }, manana).aplica).toBe(false);
  });

  it('si una zona la comparten Falabella y otro, se sigue pidiendo', () => {
    const transicion: ConfigZonas = { ...HOY, sur: { ...HOY.sur, empresas: ['Luis Fica', 'Falabella'] } };
    const r = despachoPorSendu({ sector_comuna: 'Región Sur', lat: -38.7 }, transicion);
    expect(r.aplica).toBe(true);
    expect(r.motivo).toBe('Región Sur la lleva Falabella: se despacha por Sendu.');
  });

  // Sin zona no se afirma nada: un aviso que se dispara por no saber entrena a ignorarlo.
  it('sin sector no se afirma nada', () => {
    const r = despachoPorSendu({ sector_comuna: '' }, HOY);
    expect(r.aplica).toBe(false);
    expect(r.zona).toBeNull();
    expect(r.motivo).toBe('Sin zona definida: no se puede saber si va por Sendu.');
  });

  it('tienda nula no rompe', () => {
    expect(despachoPorSendu(null, HOY).aplica).toBe(false);
  });

  // "Región" a secas sin GPS cae al sur, que es lo más común (mismo criterio que el ruteo).
  it('"Región" sin GPS cae al sur', () => {
    expect(despachoPorSendu({ sector_comuna: 'Región' }, HOY).zona).toBe('sur');
  });

  it('una zona sin transportista asignado no pide Sendu, y lo dice', () => {
    const sinNadie: ConfigZonas = { ...HOY, norte: { ...HOY.norte, empresas: [] } };
    const r = despachoPorSendu({ sector_comuna: 'Región Norte' }, sinNadie);
    expect(r.aplica).toBe(false);
    expect(r.motivo).toBe('Región Norte no tiene transportista asignado: no se despacha por Sendu.');
  });
});
