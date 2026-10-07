import { describe, it, expect } from 'vitest';
import { destinoDeLaFila } from '../destinoDeLaFila';

// ── LAS 443 FILAS DE 18 TIENDAS ───────────────────────────────────────────────────────────────
//
// Medido el 07/10/2026: todas las tiendas de Región tenían sus filas de Picking en `despacho_rm`,
// con `region='RM'` y el CÓDIGO en vez del nombre, porque la tabla estaba fija en el código y la
// tienda se buscaba en el catálogo estático de Santiago, que no las conoce.

/** Los datos reales de la tabla `tiendas`. */
const BD = {
  '47PTV': { nombre: 'Puerto Varas', region: 'Los Lagos',  sector_comuna: 'Región' },
  '60PBL': { nombre: 'Los Pablos',   region: 'Araucanía',  sector_comuna: 'Región Sur' },
  '01TPS': { nombre: 'Los Toros',    region: 'RM',         sector_comuna: 'Corredor Norte' },
  '08RNC': { nombre: 'Reñaca',       region: 'VR',         sector_comuna: 'Costa' },
  '12LAS': { nombre: 'Las Condes',   region: 'RM',         sector_comuna: 'Las Condes' },
};

/** El catálogo estático: solo Santiago, y por eso era el que fallaba. */
const estatico: Record<string, { tienda: string; region: string; comuna: string }> = {
  '01TPS': { tienda: 'Los Toros', region: 'RM', comuna: 'Quilicura' },
};

describe('la fila va a la tabla de su bodega', () => {
  it('EL CASO 47PTV: deja de ir a la tabla de RM con el código por nombre', () => {
    const d = destinoDeLaFila('47PTV', BD['47PTV'], estatico['47PTV']);
    expect(d.tabla).toBe('despacho_regiones');
    expect(d.tienda).toBe('Puerto Varas');
    expect(d.region).toBe('Los Lagos');
  });

  it('EL CASO 60PBL, que solo existe en Config', () => {
    const d = destinoDeLaFila('60PBL', BD['60PBL'], undefined);
    expect(d.tabla).toBe('despacho_regiones');
    expect(d.tienda).toBe('Los Pablos');
    expect(d.region).toBe('Araucanía');
  });

  it('una de Santiago sigue yendo a la tabla de RM', () => {
    const d = destinoDeLaFila('01TPS', BD['01TPS'], estatico['01TPS']);
    expect(d.tabla).toBe('despacho_rm');
    expect(d.tienda).toBe('Los Toros');
  });

  it('Costa es de RM/Costa, no de región', () => {
    expect(destinoDeLaFila('08RNC', BD['08RNC'], undefined).tabla).toBe('despacho_rm');
  });
});

describe('urbano / extraurbano', () => {
  it('una comuna de la lista es Urbano', () => {
    expect(destinoDeLaFila('12LAS', BD['12LAS'], undefined).tipo_comuna).toBe('Urbano');
  });

  it('una de región es Extraurbano', () => {
    expect(destinoDeLaFila('47PTV', BD['47PTV'], undefined).tipo_comuna).toBe('Extraurbano');
  });
});

describe('cuando la BD no contesta', () => {
  it('cae al catálogo estático y NO empeora lo que ya funcionaba', () => {
    const d = destinoDeLaFila('01TPS', null, estatico['01TPS']);
    expect(d).toMatchObject({ tabla: 'despacho_rm', tienda: 'Los Toros', region: 'RM', comuna: 'Quilicura' });
  });

  it('sin ninguno de los dos la fila SE ESCRIBE IGUAL: perderla sería peor', () => {
    // Es lo que hacía antes para toda tienda desconocida. Lo que cambia es que ahora solo pasa
    // con una que no existe en NINGÚN catálogo.
    const d = destinoDeLaFila('99XXX', null, null);
    expect(d).toMatchObject({ tabla: 'despacho_rm', tienda: '99XXX', region: 'RM' });
  });

  it('la BD manda sobre el estático', () => {
    const d = destinoDeLaFila('01TPS', BD['47PTV'], estatico['01TPS']);
    expect(d.tabla).toBe('despacho_regiones');
    expect(d.tienda).toBe('Puerto Varas');
  });
});
