/**
 * SIMULACIÓN DEL DÍA DE DESPACHO — corre el flujo real de punta a punta.
 *
 * Reproduce cómo trabaja el coordinador: bodega va reportando por partes (primero Regiones, luego
 * Costa, luego Santiago), el tablero se arma solo, él mueve lo que no le convence, llega carga
 * tarde, y al final se cierra el día. Cada paso verifica los invariantes que la operación no
 * puede romper.
 *
 * Existe porque los bugs que dolieron no se veían en tests unitarios: un camión con Castro
 * (1.045 km) y Puente Alto (18 km) en el mismo viaje, Costa partida en tres camiones, tiendas que
 * desaparecían del pool. Todos aparecen recién cuando se mira el día completo.
 *
 * Usa el catálogo estático, así que no depende de la BD ni de la red.
 */
import { describe, it, expect } from 'vitest';
import { enrutarV2, OPCIONES_DEFAULT, zonaDeTienda, kmRuta, ventanasIncumplidas } from '../utils/enrutadorV2';
import { poolDesdeCalT, type CalTData } from '../utils/poolDespacho';
import { rutasDesdeAsignaciones, type StoreItem, type Ruta } from '../utils/routing';
import { tiendasArmadasSinRutear } from '../utils/tiendasSinRutear';
import { poolPendiente } from '../utils/helpers';
import { TIENDAS_INICIAL, GPS_INICIAL, CD_INICIAL } from '../data/tiendas';
import type { Vehiculo } from '../data/flota';

const CD = CD_INICIAL;
const gps: Record<string, number[]> = GPS_INICIAL;
// El catálogo estático guarda el sector en `z`; en producción viene de tiendas.sector_comuna.
const tiendas = Object.fromEntries(
  Object.entries(TIENDAS_INICIAL).map(([c, t]) => [c, { ...t, sector: t.z }]),
);

const REGIONES = ['57CAS', '31TLC'];
const COSTA    = ['37VIÑ', '08RNC', '33CON'];
const SANTIAGO = ['20CTC', '09LEO', '05LP', '02SCL', '06MQH', '18FLO', '17MAI', '32BNV'];

const V = (p: string, c: number, empresa = 'Luis Fica'): Vehiculo => ({
  p, c, b: 20, t: 'Camión', tlbd: false, on: true, porton: null, refrigerado: false, empresa,
});
const flota = [V('AAA111', 10), V('BBB222', 10), V('CCC333', 10), V('DDD444', 14), V('EEE555', 10)];

/** Lo que bodega deja en el tablero: tiendas encendidas con su carga. */
const calT = (cods: string[], p = 2): Record<string, CalTData> =>
  Object.fromEntries(cods.map(c => [c, { on: true, p, b: 1, c: 0, ch: 0 }]));

const zonaDe = (c: string) => zonaDeTienda(c, tiendas, 0, OPCIONES_DEFAULT, gps[c]?.[0], CD[0]);
const codsDe = (r: Ruta[]) => r.flatMap(x => x.ts.map(t => t.c));

describe('simulación del día de despacho', () => {

  it('el catálogo clasifica bien las cuatro zonas', () => {
    // 57CAS Castro y 31TLC Talca están al sur del CD → zona sur
    for (const c of REGIONES) expect(zonaDe(c)).toBe('sur');
    for (const c of COSTA)    expect(zonaDe(c)).toBe('costa');
    for (const c of SANTIAGO) expect(zonaDe(c)).toBe('santiago');
  });

  // ── Mañana: sale Regiones primero, como en la operación real ──────────────────
  it('paso 1 · Regiones no se rutea desde el CD, pero recibe transportista', () => {
    const r = enrutarV2(poolDesdeCalT(calT(REGIONES)), flota, gps, CD, tiendas);
    expect(r.rutas).toEqual([]);                                    // ninguna ruta calculada
    expect(r.consolidacion.flatMap(x => x.ts.map(t => t.c)).sort())  // pero sí camión asignado
      .toEqual([...REGIONES].sort());
    expect(r.avisos.join(' ')).toContain('Regiones');
  });

  // ── Después sale Costa ────────────────────────────────────────────────────────
  it('paso 2 · Costa se arma en UN camión, no uno por tienda', () => {
    const r = enrutarV2(poolDesdeCalT(calT(COSTA)), flota, gps, CD, tiendas);
    expect(r.rutas).toHaveLength(1);
    expect(r.rutas[0].ts.map(t => t.c).sort()).toEqual([...COSTA].sort());
    expect(r.costa.map(s => s.c).sort()).toEqual([...COSTA].sort());
  });

  it('paso 2b · el camión de Costa llega dentro de ventana', () => {
    const r = enrutarV2(poolDesdeCalT(calT(COSTA)), flota, gps, CD, tiendas);
    const tarde = ventanasIncumplidas(r.rutas[0].ts.map(t => t.c), gps, CD, tiendas, OPCIONES_DEFAULT);
    expect(tarde).toEqual([]);
  });

  // ── Y al final Santiago, con todo junto en el pool ─────────────────────────────
  it('paso 3 · con el día completo, NINGÚN camión mezcla zonas', () => {
    const r = enrutarV2(poolDesdeCalT(calT([...REGIONES, ...COSTA, ...SANTIAGO])), flota, gps, CD, tiendas);
    for (const ruta of r.rutas) {
      const zonas = new Set(ruta.ts.map(t => zonaDe(t.c)));
      expect(zonas.size).toBe(1);
    }
  });

  it('paso 3b · Castro nunca viaja con una tienda de Santiago', () => {
    const r = enrutarV2(poolDesdeCalT(calT([...REGIONES, ...SANTIAGO])), flota, gps, CD, tiendas);
    for (const ruta of r.rutas) expect(ruta.ts.map(t => t.c).includes('57CAS')).toBe(false);
    // Castro va en un camión de consolidación, con solo tiendas de Regiones
    const suyo = r.consolidacion.find(x => x.ts.some(t => t.c === '57CAS'));
    expect(suyo).toBeDefined();
    for (const t of suyo!.ts) expect(['sur', 'norte']).toContain(zonaDe(t.c));
  });

  it('paso 3c · ninguna tienda del pool se pierde', () => {
    const pool = poolDesdeCalT(calT([...REGIONES, ...COSTA, ...SANTIAGO]));
    const r = enrutarV2(pool, flota, gps, CD, tiendas);
    const vistas = [
      ...codsDe(r.rutas), ...codsDe(r.consolidacion), ...r.fueraDeRadio.map(s => s.c),
      ...r.segundaVuelta.map(s => s.c), ...r.sinFlota.map(s => s.c),
    ].sort();
    expect(vistas).toEqual(pool.map(s => s.c).sort());
  });

  it('paso 3d · ningún camión supera su capacidad', () => {
    const r = enrutarV2(poolDesdeCalT(calT([...COSTA, ...SANTIAGO], 3)), flota, gps, CD, tiendas);
    for (const ruta of r.rutas) expect(ruta.tp).toBeLessThanOrEqual(ruta.v.c);
  });

  // ── El coordinador mueve algo a mano ──────────────────────────────────────────
  it('paso 4 · mover una tienda de camión no rompe la ruta ni pierde carga', () => {
    const cal = calT(SANTIAGO);
    const r = enrutarV2(poolDesdeCalT(cal), flota, gps, CD, tiendas);
    // el tablero guarda patente → tiendas
    const asig: Record<string, StoreItem[]> = {};
    for (const x of r.rutas) asig[x.v.p] = x.ts.map(t => ({ c: t.c, p: t.p, b: t.b, ch: t.ch ?? 0 }));

    const [origen, destino] = Object.keys(asig);
    const movida = asig[origen][0];
    asig[origen] = asig[origen].filter(s => s.c !== movida.c);
    asig[destino] = [...asig[destino], movida];

    const rutas = rutasDesdeAsignaciones(asig, flota, gps, CD, tiendas);
    // la tienda movida está en su nuevo camión, y en uno solo
    const enDestino = rutas.find(x => x.v.p === destino)!;
    expect(enDestino.ts.map(t => t.c)).toContain(movida.c);
    expect(codsDe(rutas).filter(c => c === movida.c)).toHaveLength(1);
    // y no se perdió ninguna
    expect(codsDe(rutas).sort()).toEqual(SANTIAGO.slice().sort());
  });

  it('paso 4b · al mover, la red de seguridad no reporta faltantes', () => {
    const cal = calT(SANTIAGO);
    const r = enrutarV2(poolDesdeCalT(cal), flota, gps, CD, tiendas);
    expect(tiendasArmadasSinRutear(cal, r.rutas)).toEqual([]);
  });

  it('paso 4c · si una tienda queda fuera del tablero, la red de seguridad la marca', () => {
    const cal = calT(SANTIAGO);
    const r = enrutarV2(poolDesdeCalT(cal), flota, gps, CD, tiendas);
    const sinUna = r.rutas.map(x => ({ ...x, ts: x.ts.filter(t => t.c !== '20CTC') }));
    expect(tiendasArmadasSinRutear(cal, sinUna)).toEqual(['20CTC']);
  });

  // ── Llega carga tarde, con el tablero ya armado ───────────────────────────────
  it('paso 5 · la tienda que llega tarde queda pendiente, no se pierde', () => {
    const cal = calT(SANTIAGO);
    const r = enrutarV2(poolDesdeCalT(cal), flota, gps, CD, tiendas);
    const asig: Record<string, StoreItem[]> = {};
    for (const x of r.rutas) asig[x.v.p] = x.ts.map(t => ({ c: t.c, p: t.p, b: t.b, ch: t.ch ?? 0 }));

    // bodega reporta una tienda nueva DESPUÉS de que el tablero se armó
    const calConTardía = { ...cal, ...calT(['21NUC']) };
    const { leftover } = poolPendiente(calConTardía, asig);
    expect(leftover.map(s => s.c)).toEqual(['21NUC']);
  });

  // ── Cierre: la carga que no cabe va a 2ª vuelta, no se aplasta ────────────────
  it('paso 6 · con flota insuficiente, lo que no cabe va a 2ª vuelta sin sobrecargar', () => {
    const chica = [V('UNICO', 4)];
    const r = enrutarV2(poolDesdeCalT(calT(SANTIAGO, 2)), chica, gps, CD, tiendas);
    for (const ruta of r.rutas) expect(ruta.tp).toBeLessThanOrEqual(ruta.v.c);
    expect(r.segundaVuelta.length).toBeGreaterThan(0);
    const vistas = [...codsDe(r.rutas), ...r.segundaVuelta.map(s => s.c), ...r.fueraDeRadio.map(s => s.c)];
    expect(vistas.sort()).toEqual(SANTIAGO.slice().sort());
  });

  it('paso 6b · sin ningún camión activo, el pool entero queda en sinFlota', () => {
    const apagados = [V('OFF', 10)].map(v => ({ ...v, on: false }));
    const r = enrutarV2(poolDesdeCalT(calT(SANTIAGO)), apagados, gps, CD, tiendas);
    expect(r.rutas).toEqual([]);
    expect(r.sinFlota.map(s => s.c).sort()).toEqual(SANTIAGO.slice().sort());
  });

  // ── El día completo, de una ─────────────────────────────────────────────────
  it('día completo · resumen coherente y sin sorpresas', () => {
    const pool = poolDesdeCalT(calT([...REGIONES, ...COSTA, ...SANTIAGO]));
    const r = enrutarV2(pool, flota, gps, CD, tiendas);

    const km = r.rutas.reduce((s, x) => s + kmRuta(x.ts.map(t => t.c), gps, CD), 0);
    expect(km).toBeGreaterThan(0);
    expect(r.rutas.every(x => x.ts.length > 0)).toBe(true);
    expect(r.rutas.every(x => x.tp <= x.v.c)).toBe(true);
    // una patente no puede repetirse en dos rutas
    const patentes = r.rutas.map(x => x.v.p);
    expect(new Set(patentes).size).toBe(patentes.length);
    // ninguna tienda en dos camiones
    const todas = codsDe(r.rutas);
    expect(new Set(todas).size).toBe(todas.length);
  });
});
