import { describe, it, expect } from 'vitest';
import {
  buscarTiendas, virtualStops, googleMapsDeepLink,
  esParadaDireccion, nuevoParadaDireccionId, paradasDireccionPatch,
  construirTextoRuta, formatDuracion,
  type ParadaDireccion, type LineaParada,
} from '../planificador';

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
  it('resuelve una parada por dirección igual que una tienda (con el gps inyectado)', () => {
    const p: ParadaDireccion = { id: 'DIR-1', label: 'Av. Vitacura 2909', gps: [-33.40, -70.60] };
    const gpsExt = { ...gps, ...paradasDireccionPatch([p]).gps };
    const url = googleMapsDeepLink(start, ['26ALC', 'DIR-1'], gpsExt);
    expect(url).toContain('&destination=-33.4,-70.6'); // DIR-1 queda de destino
    expect(url).toContain('&waypoints=' + encodeURIComponent('-33.39,-70.5'));
  });
});

describe('esParadaDireccion', () => {
  it('true para ids DIR-, false para códigos de tienda', () => {
    expect(esParadaDireccion('DIR-1')).toBe(true);
    expect(esParadaDireccion('DIR-42')).toBe(true);
    expect(esParadaDireccion('26ALC')).toBe(false);
    expect(esParadaDireccion('_P1')).toBe(false);
  });
});

describe('nuevoParadaDireccionId', () => {
  it('sin existentes → DIR-1', () => {
    expect(nuevoParadaDireccionId([])).toBe('DIR-1');
  });
  it('evita choques y toma el primer hueco libre', () => {
    expect(nuevoParadaDireccionId(['DIR-1'])).toBe('DIR-2');
    expect(nuevoParadaDireccionId(['DIR-1', 'DIR-2', 'DIR-3'])).toBe('DIR-4');
    expect(nuevoParadaDireccionId(['DIR-2', 'DIR-3'])).toBe('DIR-1'); // reusa el hueco
  });
  it('ignora ids que no son de dirección', () => {
    expect(nuevoParadaDireccionId(['26ALC', '02SCL'])).toBe('DIR-1');
  });
});

describe('paradasDireccionPatch', () => {
  it('arma gps por id y tiendas con la dirección como nombre (marcadas _parada)', () => {
    const paradas: ParadaDireccion[] = [
      { id: 'DIR-1', label: 'Av. Vitacura 2909, Las Condes', gps: [-33.40, -70.60] },
      { id: 'DIR-2', label: 'Bodega Norte', gps: [-33.30, -70.70] },
    ];
    const { gps: g, tiendas: t } = paradasDireccionPatch(paradas);
    expect(g).toEqual({ 'DIR-1': [-33.40, -70.60], 'DIR-2': [-33.30, -70.70] });
    expect(t['DIR-1']).toEqual({ n: 'Av. Vitacura 2909, Las Condes', z: 'Dirección', v: '', _parada: true });
    expect(t['DIR-2'].n).toBe('Bodega Norte');
  });
  it('sin paradas → patches vacíos', () => {
    expect(paradasDireccionPatch([])).toEqual({ gps: {}, tiendas: {} });
  });
});

describe('construirTextoRuta', () => {
  const lineas: LineaParada[] = [
    { cod: 'SMB', esDireccion: false, nombre: 'Simón Bolívar', direccion: 'Av. Simón Bolívar 4800, Ñuñoa', tipo: 'Strip Center', horario: '09:00-12:00' },
    { cod: 'MAI', esDireccion: false, nombre: 'Maipú',        direccion: 'Av. Américo Vespucio 399, Maipú', tipo: 'Mall', horario: '08:30-09:30' },
    { cod: 'DIR-1', esDireccion: true, nombre: 'Av. Vitacura 2909, Las Condes' },
  ];

  it('arma la lista numerada con COD: dirección / tipo / horario + el link del mapa', () => {
    const txt = construirTextoRuta({ titulo: 'Ruta 1', lineas, km: 28, mapaUrl: 'https://maps.example/x' });
    expect(txt).toBe(
      'Ruta 1 — 3 paradas · ~28 km\n' +
      '\n' +
      '1. SMB: Av. Simón Bolívar 4800, Ñuñoa / Strip Center / 09:00-12:00\n' +
      '2. MAI: Av. Américo Vespucio 399, Maipú / Mall / 08:30-09:30\n' +
      '3. Dirección: Av. Vitacura 2909, Las Condes\n' +
      '\n' +
      'Mapa: https://maps.example/x',
    );
  });

  it('omite campos vacíos de una tienda (solo los que existen, separados por /)', () => {
    const txt = construirTextoRuta({ titulo: 'Ruta', lineas: [{ cod: 'AAA', esDireccion: false, direccion: 'Calle 1' }] });
    expect(txt).toContain('1. AAA: Calle 1');
    expect(txt).not.toContain('/');
  });

  it('singular "parada" y sin km ni mapa cuando no se pasan', () => {
    const txt = construirTextoRuta({ titulo: 'Ruta', lineas: [{ cod: 'AAA', esDireccion: false, nombre: 'A', direccion: 'Calle 1' }] });
    expect(txt.startsWith('Ruta — 1 parada\n')).toBe(true);
    expect(txt).not.toContain('~');
    expect(txt).not.toContain('Mapa:');
  });

  it('sin paradas → solo el título', () => {
    expect(construirTextoRuta({ titulo: 'Ruta 2', lineas: [] })).toBe('Ruta 2 — 0 paradas');
  });
});

describe('formatDuracion', () => {
  it('minutos bajo una hora', () => {
    expect(formatDuracion(480)).toBe('8 min');   // 8 min
    expect(formatDuracion(90)).toBe('2 min');    // redondea 1.5 → 2
    expect(formatDuracion(3540)).toBe('59 min');
  });
  it('una hora o más → "H h M min"', () => {
    expect(formatDuracion(3600)).toBe('1 h');
    expect(formatDuracion(4320)).toBe('1 h 12 min');
    expect(formatDuracion(9000)).toBe('2 h 30 min');
  });
  it('0 o undefined → vacío', () => {
    expect(formatDuracion(0)).toBe('');
    expect(formatDuracion(undefined)).toBe('');
  });
});
