import { describe, it, expect } from 'vitest';
import { parseComuna, buildZonaCentroides, buildComunaZonaMap, corredorDeTienda } from '../corredorAsignar';
import { TIENDAS_INICIAL, GPS_INICIAL } from '../../data/tiendas';

describe('parseComuna', () => {
  it('toma el último segmento de la dirección en mayúsculas', () => {
    expect(parseComuna('Av. Pdte. Kennedy Lateral 9001, Las Condes')).toBe('LAS CONDES');
    expect(parseComuna('San Ignacio 500, Quilicura')).toBe('QUILICURA');
  });
  it('vacío si no hay dirección', () => {
    expect(parseComuna('')).toBe('');
    expect(parseComuna(null)).toBe('');
  });
});

describe('buildZonaCentroides', () => {
  it('promedia el GPS por zona', () => {
    const cat = { A1: { z: 'Norte' }, A2: { z: 'Norte' }, B1: { z: 'Sur' } };
    const gps = { A1: [0, 0], A2: [2, 4], B1: [10, 10] } as Record<string, [number, number]>;
    const c = buildZonaCentroides(cat, gps);
    expect(c.Norte).toEqual([1, 2]);
    expect(c.Sur).toEqual([10, 10]);
  });
  it('ignora tiendas sin GPS o sin zona', () => {
    const cat = { A1: { z: 'Norte' }, A2: {} as { z?: string } };
    const gps = { A1: [1, 1] } as Record<string, [number, number]>;
    const c = buildZonaCentroides(cat, gps);
    expect(Object.keys(c)).toEqual(['Norte']);
  });
});

describe('buildComunaZonaMap', () => {
  it('mapea comuna a la zona más frecuente', () => {
    const cat = {
      A1: { z: 'Oriente', d: 'x, Las Condes' },
      A2: { z: 'Oriente', d: 'y, Las Condes' },
      A3: { z: 'Poniente', d: 'z, Las Condes' }, // minoría → gana Oriente
      B1: { z: 'Norte', d: 'w, Colina' },
    };
    const m = buildComunaZonaMap(cat);
    expect(m['LAS CONDES']).toBe('Oriente');
    expect(m['COLINA']).toBe('Norte');
  });
});

describe('corredorDeTienda', () => {
  const centroides = { Norte: [10, 10] as [number, number], Sur: [0, 0] as [number, number] };
  const comunaMap = { 'LAS CONDES': 'Oriente' };

  it('por GPS: elige el centroide más cercano', () => {
    expect(corredorDeTienda({ lat: 9, lng: 9 }, centroides, comunaMap)).toBe('Norte');
    expect(corredorDeTienda({ lat: 1, lng: 1 }, centroides, comunaMap)).toBe('Sur');
  });
  it('sin GPS: cae a la comuna', () => {
    expect(corredorDeTienda({ comuna: 'Las Condes' }, centroides, comunaMap)).toBe('Oriente');
  });
  it('sin GPS: parsea la comuna desde la dirección', () => {
    expect(corredorDeTienda({ direccion: 'Av X 1, Las Condes' }, centroides, comunaMap)).toBe('Oriente');
  });
  it('sin GPS ni comuna conocida → null (queda en Centro)', () => {
    expect(corredorDeTienda({ comuna: 'Comuna Rara' }, centroides, comunaMap)).toBeNull();
    expect(corredorDeTienda({}, centroides, comunaMap)).toBeNull();
  });

  it('CASO REAL: 26ALC (Alto las Condes) por sus coords → "Corredor Oriente"', () => {
    const cent = buildZonaCentroides(TIENDAS_INICIAL, GPS_INICIAL);
    const cmap = buildComunaZonaMap(TIENDAS_INICIAL);
    const [lat, lng] = GPS_INICIAL['26ALC'];
    expect(corredorDeTienda({ lat, lng }, cent, cmap)).toBe('Corredor Oriente');
    // y por comuna (sin GPS) también:
    expect(corredorDeTienda({ comuna: 'Las Condes' }, cent, cmap)).toBe('Corredor Oriente');
  });
});
