import { describe, it, expect } from 'vitest';
import {
  buscarTiendas, virtualStops, googleMapsDeepLink,
  esParadaDireccion, nuevoParadaDireccionId, paradasDireccionPatch,
  construirTextoRuta, formatDuracion, kmRutaAprox, repartirEnNRutas,
  hhmmAMin, minAHHMM, parseVentana, estadoVentana, calcularETAs,
  type ParadaDireccion, type LineaParada, filtrarPorZonas } from '../planificador';

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

  it('con punto de llegada: destino = llegada y TODAS las paradas son waypoints', () => {
    const end = { lat: -33.412581, lng: -70.632438 }; // volver al CD
    const url = googleMapsDeepLink(start, ['26ALC', '02SCL', '32BNV'], gps, end);
    expect(url).toContain('&destination=-33.412581,-70.632438');
    expect(url).toContain('&waypoints=' + encodeURIComponent('-33.39,-70.5|-33.45,-70.66|-33.36,-70.73'));
  });

  it('con punto de llegada y sin paradas: origen → llegada directo, sin waypoints', () => {
    const end = { lat: -33.41, lng: -70.63 };
    const url = googleMapsDeepLink(start, [], gps, end);
    expect(url).toContain('&destination=-33.41,-70.63');
    expect(url).not.toContain('waypoints');
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
      '\n' +
      '2. MAI: Av. Américo Vespucio 399, Maipú / Mall / 08:30-09:30\n' +
      '\n' +
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

  it('con punto de llegada (regreso): agrega la línea "↩ Llegada: …" al final del cuerpo', () => {
    const txt = construirTextoRuta({
      titulo: 'Ruta 1',
      lineas: [{ cod: 'AAA', esDireccion: false, direccion: 'Calle 1' }],
      regreso: 'CD',
      mapaUrl: 'https://maps.example/x',
    });
    expect(txt).toBe(
      'Ruta 1 — 1 parada\n\n1. AAA: Calle 1\n\n↩ Llegada: CD\n\nMapa: https://maps.example/x',
    );
  });
});

describe('kmRutaAprox', () => {
  const g: Record<string, number[]> = { A: [-33.40, -70.60], B: [-33.45, -70.66], C: [-33.36, -70.73] };
  const start: [number, number] = [-33.41, -70.63];
  it('suma los tramos (start→A→B→C) en km, redondeado', () => {
    const km = kmRutaAprox(['A', 'B', 'C'], g, start);
    expect(km).toBeGreaterThan(0);
    expect(Number.isInteger(km)).toBe(true);
  });
  it('sin paradas → 0', () => {
    expect(kmRutaAprox([], g, start)).toBe(0);
  });
  it('ignora cods sin coordenadas', () => {
    expect(kmRutaAprox(['A', 'ZZZ', 'B'], g, start)).toBe(kmRutaAprox(['A', 'B'], g, start));
  });
  it('con punto de llegada suma el tramo final (más km que sin llegada)', () => {
    const end: [number, number] = [-33.30, -70.75];
    expect(kmRutaAprox(['A', 'B', 'C'], g, start, end)).toBeGreaterThan(kmRutaAprox(['A', 'B', 'C'], g, start));
  });
  it('sin paradas pero con llegada: cuenta start→end', () => {
    const end: [number, number] = [-33.30, -70.75];
    expect(kmRutaAprox([], g, start, end)).toBe(kmRutaAprox(['A'], { A: end }, start));
  });
});

describe('repartirEnNRutas', () => {
  // Dos clústeres claros: ESTE (lng ~ +1) y OESTE (lng ~ -1), partida en el origen.
  const este = ['E1', 'E2', 'E3'];
  const oeste = ['W1', 'W2', 'W3'];
  const gEO: Record<string, number[]> = {
    E1: [0, 1], E2: [0.1, 1.1], E3: [-0.1, 0.9],
    W1: [0, -1], W2: [0.1, -1.1], W3: [-0.1, -0.9],
  };
  const start = [0, 0];
  const set = (a: string[]) => new Set(a);

  it('n=1 → una sola ruta con todas las tiendas (ordenada por cercanía)', () => {
    const { rutas, sinGps } = repartirEnNRutas([...este, ...oeste], 1, gEO, start);
    expect(rutas).toHaveLength(1);
    expect(set(rutas[0])).toEqual(set([...este, ...oeste]));
    expect(sinGps).toEqual([]);
  });

  it('n=2 → separa los dos clústeres geográficos (este vs oeste)', () => {
    const { rutas } = repartirEnNRutas([...este, ...oeste], 2, gEO, start);
    expect(rutas).toHaveLength(2);
    const grupos = rutas.map(set);
    // cada ruta es exactamente uno de los clústeres (sin importar cuál va primero)
    expect(grupos).toContainEqual(set(este));
    expect(grupos).toContainEqual(set(oeste));
  });

  it('cubre todas las tiendas exactamente una vez (sin pérdidas ni duplicados)', () => {
    const { rutas, sinGps } = repartirEnNRutas([...este, ...oeste], 3, gEO, start);
    const todas = rutas.flat().concat(sinGps).sort();
    expect(todas).toEqual([...este, ...oeste].sort());
    // sin duplicados
    expect(new Set(rutas.flat()).size).toBe(rutas.flat().length);
  });

  it('balancea la cantidad (los tamaños difieren como mucho en 1)', () => {
    const cods = ['E1', 'E2', 'E3', 'W1', 'W2', 'W3', 'E1x', 'W1x'];
    const g = { ...gEO, E1x: [0.2, 1.2], W1x: [0.2, -1.2] };
    const { rutas } = repartirEnNRutas(cods, 3, g, start);
    expect(rutas).toHaveLength(3);
    const sizes = rutas.map(r => r.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it('separa las tiendas sin coordenadas en sinGps (no se pierden ni entran al ruteo)', () => {
    const { rutas, sinGps } = repartirEnNRutas(['E1', 'NOCOORD', 'W1'], 2, gEO, start);
    expect(sinGps).toEqual(['NOCOORD']);
    expect(rutas.flat().sort()).toEqual(['E1', 'W1']);
  });

  it('dedup: ignora códigos repetidos en la entrada', () => {
    const { rutas } = repartirEnNRutas(['E1', 'E1', 'W1'], 2, gEO, start);
    expect(rutas.flat().sort()).toEqual(['E1', 'W1']);
  });

  it('sin ninguna tienda con GPS → N rutas vacías', () => {
    const { rutas, sinGps } = repartirEnNRutas(['X', 'Y'], 3, {}, start);
    expect(rutas).toEqual([[], [], []]);
    expect(sinGps).toEqual(['X', 'Y']);
  });

  it('n mayor que la cantidad de tiendas → algunas rutas quedan vacías', () => {
    const { rutas } = repartirEnNRutas(['E1', 'W1'], 4, gEO, start);
    expect(rutas).toHaveLength(4);
    expect(rutas.filter(r => r.length > 0)).toHaveLength(2);
    expect(rutas.flat().sort()).toEqual(['E1', 'W1']);
  });

  it('n<1 se normaliza a 1', () => {
    const { rutas } = repartirEnNRutas([...este], 0, gEO, start);
    expect(rutas).toHaveLength(1);
    expect(set(rutas[0])).toEqual(set(este));
  });
});

describe('ETA + ventana horaria', () => {
  it('hhmmAMin parsea HH:MM a minutos del día y rechaza inválidos', () => {
    expect(hhmmAMin('08:30')).toBe(510);
    expect(hhmmAMin('00:00')).toBe(0);
    expect(hhmmAMin('23:59')).toBe(1439);
    expect(hhmmAMin('9:05')).toBe(545);
    expect(hhmmAMin('24:00')).toBeNull();
    expect(hhmmAMin('08:70')).toBeNull();
    expect(hhmmAMin('')).toBeNull();
    expect(hhmmAMin('abc')).toBeNull();
  });

  it('minAHHMM formatea y envuelve a 24h', () => {
    expect(minAHHMM(510)).toBe('08:30');
    expect(minAHHMM(0)).toBe('00:00');
    expect(minAHHMM(1439)).toBe('23:59');
    expect(minAHHMM(1440 + 90)).toBe('01:30'); // envuelve
  });

  it('parseVentana parsea "08:30-09:30" y descarta lo inválido', () => {
    expect(parseVentana('08:30-09:30')).toEqual({ open: 510, close: 570 });
    expect(parseVentana('09:00-12:00')).toEqual({ open: 540, close: 720 });
    expect(parseVentana('')).toBeNull();
    expect(parseVentana(undefined)).toBeNull();
    expect(parseVentana('08:30')).toBeNull();     // falta el cierre
    expect(parseVentana('xx-yy')).toBeNull();
  });

  it('estadoVentana clasifica temprano / ok / tarde / sin-ventana', () => {
    expect(estadoVentana(500, '08:30-09:30')).toBe('temprano'); // 08:20 < 08:30
    expect(estadoVentana(540, '08:30-09:30')).toBe('ok');       // 09:00 dentro
    expect(estadoVentana(510, '08:30-09:30')).toBe('ok');       // 08:30 justo al abrir
    expect(estadoVentana(570, '08:30-09:30')).toBe('ok');       // 09:30 justo al cerrar
    expect(estadoVentana(600, '08:30-09:30')).toBe('tarde');    // 10:00 > 09:30
    expect(estadoVentana(600, '')).toBe('sin-ventana');
  });

  it('calcularETAs acumula manejo + servicio desde la salida', () => {
    // salida 08:00 (480). Manejo: 10 min, 20 min, 5 min. Servicio 0.
    const legSec = [600, 1200, 300];
    expect(calcularETAs(legSec, 480, 0)).toEqual([490, 510, 515]); // 08:10, 08:30, 08:35
  });

  it('calcularETAs suma el servicio por parada (antes de la siguiente)', () => {
    // salida 08:00, manejo 10 y 10 min, servicio 15 min/parada.
    // parada 1: 08:00 +10 = 08:10 (490). luego +15 servicio. parada 2: 08:25 +10 = 08:35 (515).
    expect(calcularETAs([600, 600], 480, 15)).toEqual([490, 515]);
  });

  it('calcularETAs trata legs faltantes como 0', () => {
    expect(calcularETAs([600, undefined as unknown as number, 600], 480, 0)).toEqual([490, 490, 500]);
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

// ─── Filtrar el día por zona ──────────────────────────────────────────────────
// "Armar desde el calendario" tomaba los tres grupos sin preguntar: pedir "Congelados, lunes,
// 2 rutas" traía también Antofagasta y Puerto Montt.
describe('filtrarPorZonas', () => {
  // Sectores y latitudes reales.
  const SECTOR: Record<string, string> = {
    '22LGN': 'Corredor Norte',   // Santiago
    '52MUT': 'Corredor Oriente', // Santiago
    '37VIÑ': 'Costa',            // Costa
    '57CAS': 'Región',           // Regiones — la latitud decide sur
    '41ANA': 'Región',           // Regiones — la latitud decide norte
    'XXSIN': '',                 // sin sector → sin zona
  };
  const LAT: Record<string, number> = {
    '22LGN': -33.36, '52MUT': -33.40, '37VIÑ': -33.01, '57CAS': -42.48, '41ANA': -23.67, 'XXSIN': -33.4,
  };
  const TODAS = ['22LGN', '52MUT', '37VIÑ', '57CAS', '41ANA'];
  const correr = (cods: string[], zonas: Parameters<typeof filtrarPorZonas>[1]) =>
    filtrarPorZonas(cods, zonas, c => SECTOR[c], c => LAT[c]);

  it('sin zonas elegidas trae todo: no elegir no puede dejar el plan en blanco', () => {
    expect(correr(TODAS, []).incluidas).toEqual(TODAS);
  });

  // El caso reportado: quiero planificar solo Santiago.
  it('solo Santiago deja fuera Costa y Regiones', () => {
    expect(correr(TODAS, ['santiago']).incluidas).toEqual(['22LGN', '52MUT']);
  });

  it('se pueden combinar zonas: RM + Costa', () => {
    expect(correr(TODAS, ['santiago', 'costa']).incluidas).toEqual(['22LGN', '52MUT', '37VIÑ']);
  });

  // El calendario trata Regiones como una sola cosa ('fal'); acá se separan por latitud.
  it('separa Región Sur de Región Norte, que el calendario no distingue', () => {
    expect(correr(TODAS, ['sur']).incluidas).toEqual(['57CAS']);
    expect(correr(TODAS, ['norte']).incluidas).toEqual(['41ANA']);
  });

  it('cuenta cuántas hay por zona, aunque no estén elegidas', () => {
    expect(correr(TODAS, ['santiago']).porZona).toEqual({ santiago: 2, costa: 1, sur: 1, norte: 1 });
  });

  // Una tienda sin sector no se cuela ni se pierde callada: se informa.
  it('las que no se pueden clasificar salen aparte, no dentro', () => {
    const r = correr([...TODAS, 'XXSIN'], ['santiago']);
    expect(r.sinZona).toEqual(['XXSIN']);
    expect(r.incluidas).not.toContain('XXSIN');
  });

  it('tampoco se cuelan cuando no se filtra nada', () => {
    const r = correr(['XXSIN'], []);
    expect(r.incluidas).toEqual([]);
    expect(r.sinZona).toEqual(['XXSIN']);
  });

  it('conserva el orden de entrada', () => {
    expect(correr(['52MUT', '22LGN'], ['santiago']).incluidas).toEqual(['52MUT', '22LGN']);
  });

  it('lista vacía no rompe', () => {
    expect(correr([], ['santiago'])).toMatchObject({ incluidas: [], sinZona: [] });
  });
});
