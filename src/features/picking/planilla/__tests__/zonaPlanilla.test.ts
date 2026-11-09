import { describe, it, expect } from 'vitest';
import { zonaPlanilla, COLOR_ZONA } from '../zonaPlanilla';
import { COLOR_ZONA as COMPARTIDA, ZONAS, aColorSheets } from '@/lib/coloresZona';

/** Suma de los tres canales: alcanza para comparar cuál es más oscuro. */
const luz = (hex: string) => [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);

describe('zonaPlanilla: la zona con la que se pinta una tienda', () => {
  it('una tienda de Regiones que además es MALL va por su RUTA, no de rosa', () => {
    // 46TRE, 36CHL y 60PBL son MALL y de Regiones: el calendario las pinta por ruta.
    expect(zonaPlanilla({ sector: 'Región', lat: -36.79, tipo: 'MALL' })).toBe('sur');
    expect(zonaPlanilla({ sector: 'Región Sur', lat: -38.75, tipo: 'MALL' })).toBe('sur');
  });

  it('un MALL de RM sí va de rosa', () => {
    // 26ALC (Las Condes), 29CFL y 59EGN.
    expect(zonaPlanilla({ sector: 'Las Condes', lat: -33.388, tipo: 'MALL' })).toBe('mall');
  });

  it('un stripcenter de RM queda en blanco', () => {
    expect(zonaPlanilla({ sector: 'Corredor Norte', lat: -33.347, tipo: 'STRIPCENTER' })).toBe('rm');
  });

  it('«Región» a secas se desempata por latitud', () => {
    expect(zonaPlanilla({ sector: 'Región', lat: -20.2, tipo: 'TIENDA' })).toBe('norte');
    expect(zonaPlanilla({ sector: 'Región', lat: -39.6, tipo: 'TIENDA' })).toBe('sur');
  });

  it('«Región Norte» manda sobre la latitud', () => {
    expect(zonaPlanilla({ sector: 'Región Norte', lat: -39.6, tipo: 'TIENDA' })).toBe('norte');
  });

  it('Costa es su propia zona', () => {
    expect(zonaPlanilla({ sector: 'Costa', lat: -33.04, tipo: 'TIENDA' })).toBe('costa');
  });

  it('sin sector no revienta: cae en rm', () => {
    expect(zonaPlanilla({ sector: null, lat: null, tipo: null })).toBe('rm');
    expect(zonaPlanilla(null)).toBe('rm');
  });

  it('la paleta que usa la planilla ES la tabla compartida, no una copia', () => {
    // Fijar los hex acá no servía de nada: lo que falló de verdad fue que hubiera TRES copias
    // y dos tuvieran el norte y el sur al revés. Lo que hay que fijar es la identidad.
    expect(COLOR_ZONA).toBe(COMPARTIDA);
    expect(Object.keys(COLOR_ZONA)).toHaveLength(5);
  });

  it('cada zona trae sus cuatro valores y el del Sheet', () => {
    for (const z of ZONAS) {
      const c = COLOR_ZONA[z];
      for (const k of ['bg', 'text', 'border', 'sheet'] as const) {
        expect(c[k], z + '.' + k).toMatch(/^#[0-9A-F]{6}$/);
      }
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('el relleno del Sheet es MÁS oscuro que el de pantalla', () => {
    // En la planilla de cálculo no hay borde ni tarjeta que recorte la celda: el relleno de
    // pantalla, casi blanco, no se vería sobre el fondo blanco.
    for (const z of ZONAS) {
      expect(luz(COLOR_ZONA[z].sheet), z).toBeLessThan(luz(COLOR_ZONA[z].bg));
    }
  });

  it('el borde es más OSCURO que el relleno: define en vez de brillar', () => {
    // Era al revés en la paleta vieja, y por eso el bloque flotaba y competía con los números.
    for (const z of ZONAS) {
      expect(luz(COLOR_ZONA[z].border), z).toBeLessThan(luz(COLOR_ZONA[z].bg));
      expect(luz(COLOR_ZONA[z].text), z).toBeLessThan(luz(COLOR_ZONA[z].border));
    }
  });

  it('aColorSheets convierte a lo que pide la API de Google', () => {
    expect(aColorSheets('#FFFFFF')).toEqual({ red: 1, green: 1, blue: 1 });
    expect(aColorSheets('#000000')).toEqual({ red: 0, green: 0, blue: 0 });
    for (const v of Object.values(aColorSheets(COLOR_ZONA.norte.sheet))) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('zonaPlanilla: el tipo tal como viene del catálogo', () => {
  it('reconoce el mall con minúsculas, espacios o un nombre más largo', () => {
    // El catálogo se carga a mano; `esMall` es la fuente única que ya usa el calendario.
    expect(zonaPlanilla({ sector: 'Las Condes', lat: -33.4, tipo: 'mall' })).toBe('mall');
    expect(zonaPlanilla({ sector: 'Las Condes', lat: -33.4, tipo: ' MALL ' })).toBe('mall');
    expect(zonaPlanilla({ sector: 'Las Condes', lat: -33.4, tipo: 'Mall Plaza' })).toBe('mall');
  });

  it('«punto» y «oficina» no son mall: caen en rm', () => {
    // Existen en el catálogo y no son tiendas de abastecimiento.
    expect(zonaPlanilla({ sector: 'Santiago', lat: -33.44, tipo: 'punto' })).toBe('rm');
    expect(zonaPlanilla({ sector: 'Santiago', lat: -33.44, tipo: 'oficina' })).toBe('rm');
  });

  it('sin tipo cae en rm', () => {
    expect(zonaPlanilla({ sector: 'Corredor Sur', lat: -33.5 })).toBe('rm');
  });
});

describe('zonaPlanilla: la prioridad de la zona sobre el tipo', () => {
  it('Costa + MALL va a costa, no a mall', () => {
    // La otra mitad de la regla: la zona manda sobre el tipo en Costa igual que en Regiones.
    expect(zonaPlanilla({ sector: 'Costa', lat: -33.04, tipo: 'MALL' })).toBe('costa');
  });

  it('«Región» a secas y sin latitud cae en sur', () => {
    // `sectores.ts` lo decide así: sin GPS, el sur es lo más común. Se fija acá para que no
    // cambie en silencio. 61RIO está en la base sin lat.
    expect(zonaPlanilla({ sector: 'Región', lat: null, tipo: 'STRIPCENTER' })).toBe('sur');
    expect(zonaPlanilla({ sector: 'Región Sur', lat: null, tipo: 'STRIPCENTER' })).toBe('sur');
  });
});
