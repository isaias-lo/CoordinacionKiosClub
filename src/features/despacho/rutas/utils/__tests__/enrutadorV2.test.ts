import { describe, it, expect } from 'vitest';
import {
  aMinutos, parseVentana, kmRuta, diametroKm, horariosLlegada, ventanasIncumplidas,
  ordenVecinoCercano, dosOpt, ordenarParadas, agruparPorAhorro, emparejarCamiones,
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
  D: [-33.4126, -70.6024], LEJOS: [-33.4126, -69.6024], SUR: [-33.5126, -70.6324],
};
const S = (c: string, p = 1, b = 0, ch = 0): StoreItem => ({ c, p, b, ch });
const V = (p: string, c: number, b: number, extra: Partial<Vehiculo> = {}): Vehiculo => ({
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

describe('emparejarCamiones', () => {
  const g = (p: number, b = 0, ch = 0) => ({ cods: ['X'], p, b, ch });

  it('la capacidad se mide solo en pallets, no en bultos', () => {
    const flota = [V('CHICO', 4, 2)];   // capacidad de bultos ridícula, da igual
    expect(emparejarCamiones([g(3, 99)], flota)[0].v?.p).toBe('CHICO');
  });

  it('usa el camión más chico que aguante, no el primero', () => {
    const flota = [V('CHICO', 4, 20), V('GRANDE', 14, 40)];
    expect(emparejarCamiones([g(3)], flota)[0].v?.p).toBe('CHICO');
  });

  it('deja el grande para el grupo pesado', () => {
    const flota = [V('CHICO', 4, 20), V('GRANDE', 14, 40)];
    const r = emparejarCamiones([g(10), g(2)], flota);
    expect(r[0].v?.p).toBe('GRANDE');
    expect(r[1].v?.p).toBe('CHICO');
  });

  it('prefiere un refrigerado cuando el grupo lleva congelados', () => {
    const flota = [V('SECO', 10, 20), V('FRIO', 10, 20, { refrigerado: true })];
    expect(emparejarCamiones([g(2, 1, 1)], flota)[0].v?.p).toBe('FRIO');
    expect(emparejarCamiones([g(2, 0, 0)], flota)[0].v?.p).toBe('SECO');
  });

  it('no reutiliza el mismo camión en dos grupos', () => {
    const flota = [V('UNO', 10, 20), V('DOS', 10, 20)];
    const r = emparejarCamiones([g(1), g(1)], flota);
    expect(r[0].v?.p).not.toBe(r[1].v?.p);
  });

  it('cae al furgón TLBD cuando ya no quedan camiones', () => {
    const flota = [V('UNO', 10, 20), V('TLBD', 3, 6, { tlbd: true })];
    const r = emparejarCamiones([g(1), g(1)], flota);
    expect(r[1].v?.p).toBe('TLBD');
  });

  it('devuelve null si no hay ningún vehículo', () => {
    expect(emparejarCamiones([g(1)], [])[0].v).toBeNull();
  });

  it('ignora los camiones apagados', () => {
    expect(emparejarCamiones([g(1)], [V('OFF', 10, 20, { on: false })])[0].v).toBeNull();
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

  it('saca del pool RM las tiendas fuera del radio y lo avisa', () => {
    const r = enrutarV2([S('A'), S('LEJOS')], flota, GPS, CD, undefined, { radioRMKm: 60 });
    expect(r.fueraDeRadio.map(s => s.c)).toEqual(['LEJOS']);
    expect(r.rutas.flatMap(x => x.ts.map(t => t.c))).not.toContain('LEJOS');
    expect(r.avisos.join(' ')).toContain('LEJOS');
  });

  it('con radioRMKm 0 no descarta nada', () => {
    const r = enrutarV2([S('A'), S('LEJOS')], flota, GPS, CD, undefined, { radioRMKm: 0, maxDiametroKm: 0, respetarVentanas: false });
    expect(r.fueraDeRadio).toEqual([]);
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

  it('avisa cuando un camión queda sobrecargado', () => {
    const r = enrutarV2([S('A', 12)], [V('CHICO', 4, 20)], GPS, CD, undefined, { respetarVentanas: false });
    expect(r.avisos.join(' ')).toContain('sobrecargado');
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
