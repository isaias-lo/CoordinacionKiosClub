import { describe, it, expect } from 'vitest';
import {
  aMinutos, parseVentana, kmRuta, diametroKm, horariosLlegada, ventanasIncumplidas,
  ordenVecinoCercano, dosOpt, ordenarParadas, agruparPorAhorro,
  empresaDelGrupo, mejorCamion, empacarEnFlota, zonaDeTienda,
  enrutarV2, OPCIONES_DEFAULT,
} from '../enrutadorV2';
import type { StoreItem } from '../routing';
import type { Vehiculo } from '../../data/flota';
import type { TiendaInfo } from '../../data/tiendas';

const CD: [number, number] = [-33.412581, -70.632438];
const O = OPCIONES_DEFAULT;

// Tiendas sintéticas sobre un eje este-oeste: separadas ~1 km cada 0.01 de longitud.
const GPS: Record<string, number[]> = {
  A: [-33.4126, -70.6324], B: [-33.4126, -70.6224], C: [-33.4126, -70.6124],
  D: [-33.4126, -70.6024], SUR: [-33.5126, -70.6324],
  // ~93 km del CD → zona COSTA (se rutea, en camión aparte)
  LEJOS: [-33.4126, -69.6024],
  // ~465 km del CD → zona REGIONES (sale por Sendu)
  REGION: [-33.4126, -65.6024],
};
const S = (c: string, p = 1, b = 0, ch = 0): StoreItem => ({ c, p, b, ch });
const V = (p: string, c: number, b = 20, extra: Partial<Vehiculo> = {}): Vehiculo => ({
  p, c, b, t: 'Camión', tlbd: false, on: true, porton: null, refrigerado: false, empresa: '', ...extra,
});
const T = (v: string): TiendaInfo => ({ n: '', z: '', v });

describe('aMinutos', () => {
  it('convierte HH:MM a minutos', () => {
    expect(aMinutos('00:00')).toBe(0);
    expect(aMinutos('08:30')).toBe(510);
    expect(aMinutos('23:59')).toBe(1439);
  });
  it('rechaza lo que no es hora válida', () => {
    for (const x of ['', '8', '25:00', '08:70', 'mañana', '08-30']) expect(aMinutos(x)).toBeNull();
  });
});

describe('parseVentana', () => {
  it('parsea el formato normal del catálogo', () => {
    expect(parseVentana('09:00-12:00')).toEqual({ abre: 540, cierra: 720 });
  });
  it('tolera espacios alrededor del guion', () => {
    expect(parseVentana('09:00 - 14:00')).toEqual({ abre: 540, cierra: 840 });
  });
  it('con dos franjas toma la de la mañana (la que aplica al despacho)', () => {
    expect(parseVentana('08:00-09:00 / 20:00-21:00')).toEqual({ abre: 480, cierra: 540 });
  });
  it('sin ventana o inválida devuelve null (la tienda no restringe)', () => {
    for (const x of ['', null, undefined, 'a convenir', '12:00-09:00']) expect(parseVentana(x as string)).toBeNull();
  });
});

describe('kmRuta', () => {
  it('mide el ciclo CD → paradas → CD', () => {
    const ida = kmRuta(['A'], GPS, CD);
    expect(ida).toBeGreaterThan(0);
    expect(kmRuta(['A', 'B'], GPS, CD)).toBeGreaterThan(ida);
  });
  it('es 0 si ninguna parada tiene GPS', () => {
    expect(kmRuta(['XX', 'YY'], GPS, CD)).toBe(0);
  });
  it('ignora las paradas sin GPS sin romperse', () => {
    expect(kmRuta(['A', 'XX', 'B'], GPS, CD)).toBeCloseTo(kmRuta(['A', 'B'], GPS, CD), 6);
  });
});

describe('diametroKm', () => {
  it('es la distancia entre las dos paradas más lejanas', () => {
    expect(diametroKm(['A', 'B', 'C'], GPS)).toBeCloseTo(diametroKm(['A', 'C'], GPS), 6);
  });
  it('es 0 con menos de dos paradas ubicadas', () => {
    expect(diametroKm(['A'], GPS)).toBe(0);
    expect(diametroKm([], GPS)).toBe(0);
  });
});

describe('horariosLlegada / ventanasIncumplidas', () => {
  it('la primera parada llega después de la hora de salida', () => {
    const t = horariosLlegada(['A', 'B'], GPS, CD, O);
    expect(t[0]).toBeGreaterThanOrEqual(8 * 60);
    expect(t[1]).toBeGreaterThan(t[0]);
  });
  it('suma el tiempo de servicio entre paradas', () => {
    const rapido = horariosLlegada(['A', 'B'], GPS, CD, { ...O, minutosPorParada: 0 });
    const lento  = horariosLlegada(['A', 'B'], GPS, CD, { ...O, minutosPorParada: 60 });
    expect(lento[1] - rapido[1]).toBeCloseTo(60, 5);
  });
  it('detecta la tienda a la que se llega tarde', () => {
    // D está a ~2.8 km del CD: a 22 km/h se llega ~08:07, después de que cierre a las 08:01.
    const tiendas = { D: T('08:00-08:01'), B: T('09:00-23:00') };
    expect(ventanasIncumplidas(['D', 'B'], GPS, CD, tiendas, O)).toEqual(['D']);
  });
  it('no marca tarde a la tienda que sí alcanza su ventana', () => {
    const tiendas = { D: T('08:00-12:00') };
    expect(ventanasIncumplidas(['D'], GPS, CD, tiendas, O)).toEqual([]);
  });
  it('una tienda sin ventana nunca incumple', () => {
    expect(ventanasIncumplidas(['A'], GPS, CD, { A: T('') }, O)).toEqual([]);
    expect(ventanasIncumplidas(['A'], GPS, CD, undefined, O)).toEqual([]);
  });
});

describe('ordenVecinoCercano', () => {
  it('recorre el eje en orden creciente de distancia al CD', () => {
    expect(ordenVecinoCercano(['D', 'B', 'C', 'A'], GPS, CD)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('es determinista: el orden de entrada no cambia el resultado', () => {
    const a = ordenVecinoCercano(['A', 'B', 'C', 'D'], GPS, CD);
    const b = ordenVecinoCercano(['C', 'A', 'D', 'B'], GPS, CD);
    expect(a).toEqual(b);
  });
  it('conserva las paradas sin GPS', () => {
    expect(ordenVecinoCercano(['A', 'XX'], GPS, CD).slice().sort()).toEqual(['A', 'XX']);
  });
});

describe('dosOpt', () => {
  it('nunca empeora el recorrido', () => {
    const orig = ['C', 'A', 'D', 'B'];
    expect(kmRuta(dosOpt(orig, GPS, CD), GPS, CD)).toBeLessThanOrEqual(kmRuta(orig, GPS, CD) + 1e-9);
  });
  it('desenreda un cruce evidente', () => {
    expect(dosOpt(['A', 'C', 'B', 'D'], GPS, CD)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('conserva exactamente las mismas paradas', () => {
    expect(dosOpt(['C', 'A', 'D', 'B'], GPS, CD).slice().sort()).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('ordenarParadas', () => {
  it('devuelve tal cual con 1 parada', () => {
    expect(ordenarParadas(['B'], GPS, CD)).toEqual(['B']);
  });
  it('con 2 paradas fija el orden por cercanía (afecta la hora de llegada, no los km)', () => {
    expect(ordenarParadas(['B', 'A'], GPS, CD)).toEqual(['A', 'B']);
    expect(ordenarParadas(['A', 'B'], GPS, CD)).toEqual(['A', 'B']);
  });
});

describe('agruparPorAhorro', () => {
  const pool = [S('A'), S('B'), S('C'), S('D')];

  it('junta todo en una ruta si cabe y está cerca', () => {
    const g = agruparPorAhorro(pool, 10, GPS, CD, undefined, { ...O, maxDiametroKm: 0, respetarVentanas: false });
    expect(g).toHaveLength(1);
    expect(g[0].slice().sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('respeta la capacidad en pallets', () => {
    const g = agruparPorAhorro(pool, 2, GPS, CD, undefined, { ...O, maxDiametroKm: 0, respetarVentanas: false });
    expect(g.length).toBeGreaterThan(1);
    for (const ruta of g) expect(ruta.length).toBeLessThanOrEqual(2);
  });

  it('los bultos NO limitan: solo los pallets ocupan capacidad', () => {
    // 3 tiendas con 5 bultos cada una y 0 pallets: viajan todas juntas, los bultos van encima.
    const conBultos = [S('A', 0, 5), S('B', 0, 5), S('C', 0, 5)];
    const g = agruparPorAhorro(conBultos, 10, GPS, CD, undefined, { ...O, maxDiametroKm: 0, respetarVentanas: false });
    expect(g).toHaveLength(1);
  });

  it('no estira una ruta más allá del diámetro máximo', () => {
    const g = agruparPorAhorro([S('A'), S('LEJOS')], 10, GPS, CD, undefined, { ...O, maxDiametroKm: 5, respetarVentanas: false });
    expect(g).toHaveLength(2);
  });

  it('no fusiona si eso rompería una ventana', () => {
    const tiendas = { A: T('08:00-23:00'), D: T('08:00-08:02') };
    const g = agruparPorAhorro([S('A'), S('D')], 10, GPS, CD, tiendas, { ...O, maxDiametroKm: 0, respetarVentanas: true });
    expect(g).toHaveLength(2);
  });

  it('no pierde ninguna tienda', () => {
    const g = agruparPorAhorro(pool, 1, GPS, CD, undefined, O);
    expect(g.flat().slice().sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('deja las tiendas sin GPS en su propio grupo', () => {
    const g = agruparPorAhorro([S('A'), S('B'), S('XX')], 10, GPS, CD, undefined, { ...O, maxDiametroKm: 0, respetarVentanas: false });
    expect(g.some(r => r.length === 1 && r[0] === 'XX')).toBe(true);
  });

  it('es determinista ante distinto orden de entrada', () => {
    const a = agruparPorAhorro([S('A'), S('B'), S('C')], 2, GPS, CD, undefined, O);
    const b = agruparPorAhorro([S('C'), S('B'), S('A')], 2, GPS, CD, undefined, O);
    expect(a).toEqual(b);
  });
});

describe('empresaDelGrupo', () => {
  it('devuelve la empresa mayoritaria del grupo', () => {
    expect(empresaDelGrupo(['A','B','C'], { A:'Luis Fica', B:'Luis Fica', C:'Ortiz' })).toBe('Luis Fica');
  });
  it('sin empresas conocidas devuelve null', () => {
    expect(empresaDelGrupo(['A','B'], {})).toBeNull();
    expect(empresaDelGrupo([], { A:'Ortiz' })).toBeNull();
  });
  it('rompe empates de forma determinista', () => {
    expect(empresaDelGrupo(['A','B'], { A:'Ortiz', B:'Kios Club' })).toBe('Kios Club');
    expect(empresaDelGrupo(['B','A'], { A:'Ortiz', B:'Kios Club' })).toBe('Kios Club');
  });
});

describe('mejorCamion', () => {
  const g = (p: number, ch = 0, cods = ['X']) => ({ cods, p, ch });

  it('elige el más chico que aguante, no el primero', () => {
    expect(mejorCamion(g(3), [V('GRANDE', 14), V('CHICO', 4)], {})!.p).toBe('CHICO');
  });
  it('devuelve null si ninguno lo aguanta entero', () => {
    expect(mejorCamion(g(20), [V('A', 10), V('B', 14)], {})).toBeNull();
  });
  it('la capacidad se mide solo en pallets', () => {
    expect(mejorCamion(g(3), [V('CHICO', 4, 1)], {})!.p).toBe('CHICO');
  });
  it('prefiere un camión de la empresa habitual del grupo', () => {
    const flota = [V('OTRO', 10, 20, { empresa: 'Ortiz' }), V('SUYO', 10, 20, { empresa: 'Luis Fica' })];
    expect(mejorCamion(g(2, 0, ['A','B']), flota, { A:'Luis Fica', B:'Luis Fica' })!.p).toBe('SUYO');
  });
  it('la empresa manda por sobre el best-fit', () => {
    // el chico entraría por tamaño, pero es de otra empresa
    const flota = [V('CHICO_OTRO', 4, 20, { empresa: 'Ortiz' }), V('GRANDE_SUYO', 14, 20, { empresa: 'Luis Fica' })];
    expect(mejorCamion(g(3, 0, ['A']), flota, { A:'Luis Fica' })!.p).toBe('GRANDE_SUYO');
  });
  it('sin empresa conocida cae al best-fit normal', () => {
    const flota = [V('CHICO', 4), V('GRANDE', 14)];
    expect(mejorCamion(g(3, 0, ['A']), flota, {})!.p).toBe('CHICO');
  });
  it('con chocolates prefiere refrigerado; sin ellos lo evita', () => {
    const flota = [V('SECO', 10), V('FRIO', 10, 20, { refrigerado: true })];
    expect(mejorCamion(g(2, 1), flota, {})!.p).toBe('FRIO');
    expect(mejorCamion(g(2, 0), flota, {})!.p).toBe('SECO');
  });
});

describe('empacarEnFlota', () => {
  const P: Record<string, number> = { A:3, B:3, C:3, D:3, E:3, F:3, G:3, H:3, PESADA:20 };
  const pal = (c: string) => P[c] ?? 1;
  const ord = (cods: string[]) => cods.slice().sort();
  const G = (cods: string[]) => ({ cods, p: cods.reduce((s,c)=>s+pal(c),0), ch: 0 });

  it('NUNCA supera la capacidad de un camión', () => {
    // 24 pallets contra un solo camión de 10: antes se metían los 24 adentro.
    const r = empacarEnFlota([G(['A','B','C','D','E','F','G','H'])], [V('UNICO', 10)], pal, ord);
    for (const a of r.asignaciones)
      expect(a.cods.reduce((s,c)=>s+pal(c),0)).toBeLessThanOrEqual(a.v.c);
  });

  it('NO pierde ninguna tienda: lo asignado + el sobrante es todo el pool', () => {
    const cods = ['A','B','C','D','E','F','G','H'];
    const r = empacarEnFlota([G(cods)], [V('UNICO', 10)], pal, ord);
    expect([...r.asignaciones.flatMap(a => a.cods), ...r.sobrante].sort()).toEqual(cods.slice().sort());
  });

  it('parte el grupo que no entra en vez de descartarlo', () => {
    const r = empacarEnFlota([G(['A','B','C','D'])], [V('UNICO', 6)], pal, ord);
    expect(r.asignaciones).toHaveLength(1);
    expect(r.asignaciones[0].cods).toHaveLength(2);      // 2 tiendas × 3p = 6p
    expect(r.sobrante.sort()).toEqual(['C','D']);
  });

  it('con flota suficiente no deja sobrante', () => {
    const r = empacarEnFlota([G(['A','B','C','D'])], [V('A1', 6), V('A2', 6)], pal, ord);
    expect(r.sobrante).toEqual([]);
    expect(r.asignaciones).toHaveLength(2);
  });

  it('una tienda más pesada que cualquier camión queda en el sobrante, sin romper el resto', () => {
    const r = empacarEnFlota([G(['PESADA','A','B'])], [V('UNICO', 10)], pal, ord);
    expect(r.sobrante).toContain('PESADA');
    expect(r.asignaciones.flatMap(a => a.cods).sort()).toEqual(['A','B']);
  });

  it('sin camiones, todo queda en el sobrante', () => {
    const r = empacarEnFlota([G(['A','B'])], [], pal, ord);
    expect(r.asignaciones).toEqual([]);
    expect(r.sobrante.sort()).toEqual(['A','B']);
  });

  it('usa el furgón TLBD solo cuando ya no quedan camiones, y respeta su capacidad', () => {
    const flota = [V('CAMION', 6), V('FURGON', 3, 6, { tlbd: true })];
    const r = empacarEnFlota([G(['A','B']), G(['C'])], flota, pal, ord);
    const furgon = r.asignaciones.find(a => a.v.p === 'FURGON');
    expect(furgon).toBeDefined();
    expect(furgon!.cods.reduce((s,c)=>s+pal(c),0)).toBeLessThanOrEqual(3);
  });

  it('ignora los camiones apagados', () => {
    const r = empacarEnFlota([G(['A'])], [V('OFF', 10, 20, { on: false })], pal, ord);
    expect(r.asignaciones).toEqual([]);
    expect(r.sobrante).toEqual(['A']);
  });

  it('no reutiliza el mismo camión en dos grupos', () => {
    const r = empacarEnFlota([G(['A']), G(['B'])], [V('U1', 10), V('U2', 10)], pal, ord);
    expect(r.asignaciones[0].v.p).not.toBe(r.asignaciones[1].v.p);
  });

  it('es determinista ante distinto orden de los grupos', () => {
    const f = [V('X', 6), V('Y', 6)];
    const a = empacarEnFlota([G(['A','B']), G(['C','D'])], f, pal, ord);
    const b = empacarEnFlota([G(['C','D']), G(['A','B'])], f, pal, ord);
    const plano = (r: typeof a) => r.asignaciones.map(x => `${x.v.p}:${x.cods.join(',')}`).sort();
    expect(plano(a)).toEqual(plano(b));
  });
});

describe('enrutarV2', () => {
  const flota = [V('T1', 10, 20), V('T2', 10, 20)];

  it('asigna todas las tiendas del pool', () => {
    const pool = [S('A'), S('B'), S('C'), S('D')];
    const { rutas } = enrutarV2(pool, flota, GPS, CD, undefined, { maxDiametroKm: 0, respetarVentanas: false });
    expect(rutas.flatMap(r => r.ts.map(t => t.c)).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('cuadra los totales de pallets y bultos de cada ruta', () => {
    const pool = [S('A', 2, 3, 1), S('B', 1, 1)];
    const { rutas } = enrutarV2(pool, flota, GPS, CD, undefined, { maxDiametroKm: 0, respetarVentanas: false });
    const tp = rutas.reduce((s, r) => s + r.tp, 0), tb = rutas.reduce((s, r) => s + r.tb, 0);
    expect(tp).toBe(3);
    expect(tb).toBe(5); // 3+1 bultos + 1 congelado
  });

  it('lo que está más allá del radio de Costa NO se rutea, pero SÍ recibe transportista', () => {
    const conEmp = [V('T1', 10, 20, { empresa: 'Ortiz' }), V('T2', 10, 20, { empresa: 'Ortiz' })];
    const r = enrutarV2([S('A'), S('REGION')], conEmp, GPS, CD, undefined,
      { radioRMKm: 60, radioCostaKm: 200, empresaPorTienda: { REGION: 'Ortiz' } });
    // no entra en las rutas de Santiago…
    expect(r.rutas.flatMap(x => x.ts.map(t => t.c))).not.toContain('REGION');
    // …pero queda en un camión de consolidación, que es lo que hace el coordinador
    expect(r.consolidacion.flatMap(x => x.ts.map(t => t.c))).toEqual(['REGION']);
    expect(r.fueraDeRadio).toEqual([]);
    expect(r.avisos.join(' ')).toContain('REGION');
  });

  it('el camión que consolida Regiones no se usa además para Santiago', () => {
    const conEmp = [V('T1', 10, 20, { empresa: 'Ortiz' }), V('T2', 10, 20, { empresa: 'Ortiz' })];
    const r = enrutarV2([S('A'), S('B'), S('REGION')], conEmp, GPS, CD, undefined,
      { maxDiametroKm: 0, respetarVentanas: false, empresaPorTienda: { REGION: 'Ortiz' } });
    const enConsol = new Set(r.consolidacion.map(x => x.v.p));
    for (const x of r.rutas) expect(enConsol.has(x.v.p)).toBe(false);
  });

  it('sin vehículo para Regiones, quedan en fueraDeRadio con aviso', () => {
    const r = enrutarV2([S('REGION')], [], GPS, CD, undefined, {});
    expect(r.consolidacion).toEqual([]);
    expect(r.sinFlota.map(s => s.c)).toEqual(['REGION']);
  });

  it('sin camión del transportista habitual usa otro, pero lo avisa', () => {
    // Regiones sale igual: se toma el camión que haya y el transportista se corrige a mano.
    const otra = [V('T1', 10, 20, { empresa: 'Kios Club' })];
    const r = enrutarV2([S('REGION')], otra, GPS, CD, undefined, { empresaPorTienda: { REGION: 'Ortiz' } });
    expect(r.consolidacion.flatMap(x => x.ts.map(t => t.c))).toEqual(['REGION']);
    expect(r.fueraDeRadio).toEqual([]);
    expect(r.avisos.join(' ')).toContain('no quedaba camión de esa empresa');
  });

  // El orden de armado es el de la operación: Regiones primero porque es lo más lejano y sale
  // más temprano, después Costa, y Santiago al final.
  it('Regiones elige camión ANTES que Santiago', () => {
    const uno = [V('SOLO', 10, 20, { empresa: 'Ortiz' })];
    const r = enrutarV2([S('A'), S('REGION')], uno, GPS, CD, undefined,
      { respetarVentanas: false, empresaPorTienda: { REGION: 'Ortiz' } });
    // el único camión se lo lleva Regiones
    expect(r.consolidacion.map(x => x.v.p)).toEqual(['SOLO']);
    expect(r.rutas).toEqual([]);
    // y Santiago queda señalado, no se pierde
    expect([...r.segundaVuelta, ...r.sinFlota].map(s => s.c)).toContain('A');
  });

  // Las 5 tiendas de Costa están a 86–100 km: antes caían en "fuera de radio" con el mensaje de
  // Regiones, que es falso — se despachan desde el CD con camión propio.
  it('Costa SÍ se rutea: no cae en fueraDeRadio', () => {
    const r = enrutarV2([S('A'), S('LEJOS')], flota, GPS, CD, undefined, { radioRMKm: 60, radioCostaKm: 200, respetarVentanas: false });
    expect(r.fueraDeRadio).toEqual([]);
    expect(r.costa.map(s => s.c)).toEqual(['LEJOS']);
    expect(r.rutas.flatMap(x => x.ts.map(t => t.c))).toContain('LEJOS');
  });

  it('Costa NUNCA viaja en el mismo camión que Santiago', () => {
    // el caso real que se vio en producción: Castro y Puente Alto en el mismo viaje
    const r = enrutarV2([S('A'), S('B'), S('C'), S('LEJOS')], flota, GPS, CD, undefined,
      { radioRMKm: 60, radioCostaKm: 200, maxDiametroKm: 0, respetarVentanas: false });
    for (const x of r.rutas) {
      const cods = x.ts.map(t => t.c);
      expect(cods.includes('LEJOS') && cods.some(c => ['A','B','C'].includes(c))).toBe(false);
    }
  });

  it('avisa que Costa va aparte', () => {
    const r = enrutarV2([S('A'), S('LEJOS')], flota, GPS, CD, undefined, { respetarVentanas: false });
    expect(r.avisos.join(' ')).toContain('Costa');
  });

  it('con radioRMKm 0 todo es Santiago y no se descarta nada', () => {
    const r = enrutarV2([S('A'), S('REGION')], flota, GPS, CD, undefined, { radioRMKm: 0, maxDiametroKm: 0, respetarVentanas: false });
    expect(r.fueraDeRadio).toEqual([]);
    expect(r.costa).toEqual([]);
  });

  it('avisa de las tiendas sin coordenadas', () => {
    const r = enrutarV2([S('A'), S('XX')], flota, GPS, CD);
    expect(r.avisos.join(' ')).toContain('Sin coordenadas');
    expect(r.rutas.flatMap(x => x.ts.map(t => t.c))).toContain('XX');
  });

  it('sin camiones activos devuelve vacío con aviso', () => {
    const r = enrutarV2([S('A')], [V('OFF', 10, 20, { on: false })], GPS, CD);
    expect(r.rutas).toEqual([]);
    expect(r.avisos).toHaveLength(1);
  });

  it('con pool vacío no falla', () => {
    expect(enrutarV2([], flota, GPS, CD).rutas).toEqual([]);
  });

  it('lo que no cabe va a 2ª vuelta en vez de sobrecargar el camión', () => {
    const r = enrutarV2([S('A', 12)], [V('CHICO', 4)], GPS, CD, undefined, { respetarVentanas: false });
    expect(r.rutas.every(x => x.tp <= x.v.c)).toBe(true);
    expect(r.segundaVuelta.map(s => s.c)).toEqual(['A']);
    expect(r.avisos.join(' ')).toContain('2ª vuelta');
  });

  it('ningún camión supera su capacidad, con la flota que sea', () => {
    const pool = [S('A',3), S('B',3), S('C',3), S('D',3), S('SUR',3)];
    for (const flota of [[V('U',10)], [V('U',4)], [V('A',6),V('B',6)], [V('G',14)]]) {
      const r = enrutarV2(pool, flota, GPS, CD, undefined, { maxDiametroKm: 0, respetarVentanas: false });
      for (const x of r.rutas) expect(x.tp).toBeLessThanOrEqual(x.v.c);
    }
  });

  it('INVARIANTE: rutas + consolidación + fueraDeRadio + 2ª vuelta + sinFlota = el pool completo', () => {
    const pool = [S('A',3), S('B',3), S('C',3), S('D',3), S('LEJOS',3), S('REGION',3), S('XX',3)];
    for (const flota of [[V('U',10)], [V('U',4)], [], [V('OFF',10,20,{on:false})]]) {
      const r = enrutarV2(pool, flota, GPS, CD, undefined, { maxDiametroKm: 0, respetarVentanas: false });
      const vistas = [
        ...r.rutas.flatMap(x => x.ts.map(t => t.c)),
        ...r.consolidacion.flatMap(x => x.ts.map(t => t.c)),
        ...r.fueraDeRadio.map(s => s.c),
        ...r.segundaVuelta.map(s => s.c),
        ...r.sinFlota.map(s => s.c),
      ].sort();
      expect(vistas).toEqual(pool.map(s => s.c).sort());
    }
  });

  it('sin ningún vehículo activo, todo el pool queda en sinFlota', () => {
    const r = enrutarV2([S('A')], [V('OFF', 10, 20, { on: false })], GPS, CD);
    expect(r.rutas).toEqual([]);
    expect(r.sinFlota.map(s => s.c)).toEqual(['A']);
  });

  it('prefiere el camión de la empresa habitual de la tienda', () => {
    const flota = [V('OTRO', 10, 20, { empresa: 'Ortiz' }), V('SUYO', 10, 20, { empresa: 'Luis Fica' })];
    const r = enrutarV2([S('A')], flota, GPS, CD, undefined,
      { maxDiametroKm: 0, respetarVentanas: false, empresaPorTienda: { A: 'Luis Fica' } });
    expect(r.rutas[0].v.p).toBe('SUYO');
    expect(r.avisos.join(' ')).not.toContain('no había camión libre');
  });

  it('si no queda camión de esa empresa, lo asigna igual y ahí sí avisa', () => {
    const flota = [V('OTRO', 10, 20, { empresa: 'Ortiz' })];
    const r = enrutarV2([S('A')], flota, GPS, CD, undefined,
      { maxDiametroKm: 0, respetarVentanas: false, empresaPorTienda: { A: 'Luis Fica' } });
    expect(r.rutas[0].v.p).toBe('OTRO');
    expect(r.avisos.join(' ')).toContain('Luis Fica');
  });

  it('no supera el diámetro máximo dentro de una misma ruta', () => {
    const pool = [S('A'), S('B'), S('C'), S('D'), S('SUR')];
    const { rutas } = enrutarV2(pool, [V('T1', 10, 20), V('T2', 10, 20), V('T3', 10, 20)], GPS, CD,
      undefined, { maxDiametroKm: 5, respetarVentanas: false });
    for (const r of rutas) expect(diametroKm(r.ts.map(t => t.c), GPS)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it('es determinista: dos corridas iguales dan el mismo plan', () => {
    const pool = [S('A'), S('B'), S('C'), S('D')];
    const a = enrutarV2(pool, flota, GPS, CD);
    const b = enrutarV2(pool.slice().reverse(), flota, GPS, CD);
    const plano = (x: typeof a) => x.rutas.map(r => [r.v.p, ...r.ts.map(t => t.c)].join('>')).sort();
    expect(plano(a)).toEqual(plano(b));
  });
});

// ── La zona sale del catálogo, no de la distancia ────────────────────────────────
describe('zonaDeTienda', () => {
  const O2 = { ...OPCIONES_DEFAULT };
  const T2 = (sector: string): TiendaInfo => ({ n: '', z: '', v: '', sector });

  it('el catálogo manda por sobre la distancia', () => {
    // Machalí: 85 km (banda de Costa por geometría) pero el catálogo dice Región.
    expect(zonaDeTienda('27MCH', { '27MCH': T2('Región') }, 85, O2)).toBe('regiones');
    // Quilpué: misma distancia, pero el catálogo dice Costa.
    expect(zonaDeTienda('54MPQ', { '54MPQ': T2('Costa') }, 86, O2)).toBe('costa');
  });

  it('los corredores de Santiago son Santiago', () => {
    for (const s of ['Corredor Oriente', 'Corredor Sur', 'Ñuñoa', 'Las Condes'])
      expect(zonaDeTienda('X', { X: T2(s) }, 12, O2)).toBe('santiago');
  });

  it('tolera mayúsculas y acentos del catálogo', () => {
    expect(zonaDeTienda('X', { X: T2('COSTA') }, 5, O2)).toBe('costa');
    expect(zonaDeTienda('X', { X: T2('Region') }, 5, O2)).toBe('regiones');
  });

  it('sin sector cargado cae a la distancia', () => {
    expect(zonaDeTienda('X', undefined, 12, O2)).toBe('santiago');
    expect(zonaDeTienda('X', {}, 95, O2)).toBe('costa');
    expect(zonaDeTienda('X', { X: T2('') }, 400, O2)).toBe('regiones');
  });
});
