import { describe, it, expect } from 'vitest';
import { asignarPorClusters, resolverCluster } from '../asignarPorClusters';
import type { Vehiculo } from '../../data/flota';
import type { TiendaInfo } from '../../data/tiendas';
import type { StoreItem } from '../routing';

const truck = (p: string, c = 10, b = 100): Vehiculo =>
  ({ p, c, b, t: '', tlbd: false, on: true, porton: null, refrigerado: false, empresa: '' });
const s = (c: string, p = 2, b = 3): StoreItem => ({ c, p, b });
const ti = (corredor?: string): TiendaInfo => ({ n: '', z: '', v: '', corredor } as unknown as TiendaInfo);

const clusterDeTienda = { A: 0, B: 0, C: 1, D: 1 };
const centroides = { 0: { lat: -33.40, lon: -70.60 }, 1: { lat: -33.60, lon: -70.70 } };
const gps: Record<string, number[]> = {
  A: [-33.40, -70.60], B: [-33.41, -70.61], C: [-33.60, -70.70], D: [-33.61, -70.71],
};
const tiendas: Record<string, TiendaInfo> = { A: ti(), B: ti(), C: ti(), D: ti() };

describe('resolverCluster', () => {
  it('historial directo', () => {
    expect(resolverCluster('A', clusterDeTienda, centroides, gps, tiendas)).toBe(0);
  });
  it('tienda NUEVA sin historial → centroide más cercano por lat/lon', () => {
    const gps2 = { ...gps, NEW: [-33.405, -70.605] }; // pegada al centroide 0
    expect(resolverCluster('NEW', clusterDeTienda, centroides, gps2, tiendas)).toBe(0);
    const gps3 = { ...gps, NEW: [-33.605, -70.705] }; // pegada al centroide 1
    expect(resolverCluster('NEW', clusterDeTienda, centroides, gps3, tiendas)).toBe(1);
  });
  it('sin coords → por corredor', () => {
    const cd = { A: 0, B: 0 };
    const td = { A: ti('SUR'), B: ti('SUR'), NEW: ti('SUR') };
    expect(resolverCluster('NEW', cd, {}, {}, td)).toBe(0);
  });
  it('sin nada → null', () => {
    expect(resolverCluster('ZZ', clusterDeTienda, {}, {}, {})).toBeNull();
  });
});

describe('asignarPorClusters', () => {
  it('dos clusters + dos camiones → una línea por camión', () => {
    const out = asignarPorClusters([s('A'), s('B'), s('C'), s('D')], [truck('T1'), truck('T2')],
      clusterDeTienda, centroides, gps, tiendas);
    const patentes = Object.keys(out);
    expect(patentes.length).toBe(2);
    // A y B juntas; C y D juntas; y en camiones distintos
    const camDe = (cod: string) => patentes.find(p => out[p].some(t => t.c === cod));
    expect(camDe('A')).toBe(camDe('B'));
    expect(camDe('C')).toBe(camDe('D'));
    expect(camDe('A')).not.toBe(camDe('C'));
  });

  it('dos clusters + un camión → ambos en el mismo (si hay capacidad)', () => {
    const out = asignarPorClusters([s('A'), s('B'), s('C'), s('D')], [truck('T1', 20)],
      clusterDeTienda, centroides, gps, tiendas);
    expect(Object.keys(out)).toEqual(['T1']);
    expect(out['T1'].map(t => t.c).sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('tienda nueva (sin cluster) viaja con su cluster geográfico', () => {
    const gps2 = { ...gps, NEW: [-33.405, -70.605] }; // cerca del centroide 0 (A,B)
    const td = { ...tiendas, NEW: ti() };
    const out = asignarPorClusters([s('A'), s('B'), s('NEW'), s('C'), s('D')], [truck('T1'), truck('T2')],
      clusterDeTienda, centroides, gps2, td);
    const camDe = (cod: string) => Object.keys(out).find(p => out[p].some(t => t.c === cod));
    expect(camDe('NEW')).toBe(camDe('A')); // NEW cae con A/B
  });

  it('cluster que excede la capacidad → se parte entre camiones, sin exceder', () => {
    const cd = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    const stores = ['A','B','C','D','E'].map(c => s(c, 3)); // 5×3 = 15 pallets
    const out = asignarPorClusters(stores, [truck('T1', 10), truck('T2', 10)], cd, centroides, gps, tiendas);
    const asignadas = Object.values(out).flat().length;
    expect(asignadas).toBe(5); // todas asignadas
    for (const p of Object.keys(out)) {
      const carga = out[p].reduce((sm, t) => sm + t.p, 0);
      expect(carga).toBeLessThanOrEqual(10); // ningún camión excede su capacidad
    }
  });

  it('sin camiones o sin pool → vacío', () => {
    expect(asignarPorClusters([s('A')], [], clusterDeTienda, centroides, gps, tiendas)).toEqual({});
    expect(asignarPorClusters([], [truck('T1')], clusterDeTienda, centroides, gps, tiendas)).toEqual({});
  });
});
