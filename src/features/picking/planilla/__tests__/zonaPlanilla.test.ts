import { describe, it, expect } from 'vitest';
import { zonaPlanilla, COLOR_ZONA } from '../zonaPlanilla';

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

  it('la paleta tiene las cinco zonas con los colores del calendario impreso', () => {
    expect(COLOR_ZONA.norte.bg).toBe('#FEF08A');
    expect(COLOR_ZONA.sur.bg).toBe('#BAE6FD');
    expect(COLOR_ZONA.costa.bg).toBe('#99F6E4');
    expect(COLOR_ZONA.mall.bg).toBe('#FECDD3');
    expect(Object.keys(COLOR_ZONA)).toHaveLength(5);
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
