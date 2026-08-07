import { describe, it, expect } from 'vitest';
import { buscarTiendas, virtualStops, googleMapsDeepLink } from '../planificador';

const gps: Record<string, number[]> = {
  '26ALC': [-33.39, -70.50],
  '02SCL': [-33.45, -70.66],
  '32BNV': [-33.36, -70.73],
  'SINCOORD': undefined as unknown as number[], // no debería pasar, pero robustez
};
delete gps['SINCOORD'];
const catalogo = {
  '26ALC': { n: 'Alto las Condes', z: 'Las Condes' },
  '02SCL': { n: 'San Carlos', z: 'Ñuñoa' },
  '32BNV': { n: 'Buenaventura', z: 'Quilicura' },
};

describe('buscarTiendas', () => {
  it('sin query devuelve todas las que tienen coords, ordenadas por código', () => {
    expect(buscarTiendas(catalogo, gps, '').map(t => t.cod)).toEqual(['02SCL', '26ALC', '32BNV']);
  });
  it('filtra por código, nombre o comuna (case-insensitive)', () => {
    expect(buscarTiendas(catalogo, gps, 'quilicura').map(t => t.cod)).toEqual(['32BNV']);
    expect(buscarTiendas(catalogo, gps, 'alto').map(t => t.cod)).toEqual(['26ALC']);
    expect(buscarTiendas(catalogo, gps, '02').map(t => t.cod)).toEqual(['02SCL']);
  });
  it('solo incluye tiendas con coordenadas', () => {
    const res = buscarTiendas({ ...catalogo, ZZZ: { n: 'Sin coord', z: '' } }, gps, '');
    expect(res.find(t => t.cod === 'ZZZ')).toBeUndefined();
  });
  it('respeta el límite', () => {
    expect(buscarTiendas(catalogo, gps, '', 2)).toHaveLength(2);
  });
});

describe('virtualStops', () => {
  it('convierte cods en paradas sin carga', () => {
    expect(virtualStops(['A', 'B'])).toEqual([{ c: 'A', p: 0, b: 0 }, { c: 'B', p: 0, b: 0 }]);
  });
});

describe('googleMapsDeepLink', () => {
  const start = { lat: -33.41, lng: -70.63 };
  it('solo origen si no hay paradas', () => {
    expect(googleMapsDeepLink(start, [], gps)).toBe(
      'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=-33.41,-70.63',
    );
  });
  it('una parada → origin + destination, sin waypoints', () => {
    const url = googleMapsDeepLink(start, ['26ALC'], gps);
    expect(url).toContain('&origin=-33.41,-70.63');
    expect(url).toContain('&destination=-33.39,-70.5');
    expect(url).not.toContain('waypoints');
  });
  it('varias paradas → última es destino, intermedias son waypoints (en orden, encodeados)', () => {
    const url = googleMapsDeepLink(start, ['26ALC', '02SCL', '32BNV'], gps);
    expect(url).toContain('&destination=-33.36,-70.73');           // última = 32BNV
    expect(url).toContain('&waypoints=' + encodeURIComponent('-33.39,-70.5|-33.45,-70.66'));
  });
  it('ignora cods sin coordenadas', () => {
    const url = googleMapsDeepLink(start, ['26ALC', 'NOEXISTE'], gps);
    expect(url).toContain('&destination=-33.39,-70.5'); // NOEXISTE se ignora → 26ALC queda de destino
    expect(url).not.toContain('waypoints');
  });
});
