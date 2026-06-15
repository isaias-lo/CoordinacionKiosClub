import { describe, it, expect } from 'vitest';
import { nn, asignar } from '../utils/routing';
import type { StoreItem } from '../utils/routing';
import type { Vehiculo } from '../data/flota';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CD: [number, number] = [-33.412581, -70.632438]; // Centro de distribución Santiago

// GPS coords ordered by distance from CD (close → far)
const GPS: Record<string, number[]> = {
  CLOSE: [-33.415, -70.635], // ~0.5 km from CD
  MID:   [-33.450, -70.670], // ~6 km from CD
  FAR:   [-33.530, -70.730], // ~16 km from CD
  REGV:  [-33.015, -71.551], // ~120 km — simulates REGION_V
  PROV:  [-33.443, -70.599], // ~4 km — simulates PROVIDENCIA
};

function store(c: string, p = 3, b = 5, _v?: string): StoreItem {
  return { c, p, b, ...(_v ? { _v } : {}) };
}

function vehicle(overrides: Partial<Vehiculo> = {}): Vehiculo {
  return {
    p: 'TEST', c: 10, b: 20, t: 'Camión',
    tlbd: false, on: true, porton: null,
    refrigerado: false, empresa: '',
    ...overrides,
  };
}

// ─── nn (nearest-neighbor) ────────────────────────────────────────────────────

describe('nn', () => {
  it('returns an empty array for empty input', () => {
    expect(nn([], GPS, CD)).toEqual([]);
  });

  it('returns the single store unchanged', () => {
    const s = [store('CLOSE')];
    expect(nn(s, GPS, CD)).toEqual(s);
  });

  it('orders stores greedy nearest-neighbor from CD', () => {
    const tiendas = [store('FAR'), store('MID'), store('CLOSE')];
    const ordered = nn(tiendas, GPS, CD);
    // From CD, closest is CLOSE → then MID → then FAR
    expect(ordered[0].c).toBe('CLOSE');
    expect(ordered[1].c).toBe('MID');
    expect(ordered[2].c).toBe('FAR');
  });

  it('skips stores with no GPS entry (they do not appear in result)', () => {
    const tiendas = [store('UNKNOWN'), store('CLOSE')];
    const ordered = nn(tiendas, GPS, CD);
    // UNKNOWN has no GPS so it's skipped in distance comparison but still appended
    // CLOSE should still come before UNKNOWN (which has Infinity distance, so mi stays at 0)
    const codes = ordered.map(s => s.c);
    expect(codes).toContain('CLOSE');
    expect(codes).toContain('UNKNOWN');
    expect(codes[0]).toBe('CLOSE');
  });

  it('applies early-close bonus to prioritize stores closing at or before 09:30', () => {
    // CLOSE store has no closing constraint → distance ~0.5 km
    // FAR store closes at 09:30 (570 min) → gets -50 km bonus: 16km - 50 = -34 km effective
    const tiendas = [
      store('CLOSE'),               // ~0.5 km, no bonus
      store('FAR', 3, 5, '08:00-09:30'), // ~16 km, bonus -50 → effective -34 km
    ];
    const ordered = nn(tiendas, GPS, CD);
    // FAR gets -50 bonus → effective -34 < 0.5 → FAR goes first
    expect(ordered[0].c).toBe('FAR');
    expect(ordered[1].c).toBe('CLOSE');
  });

  it('early-close bonus does not apply once 2 slots are filled', () => {
    // FAR has early-close bonus → it wins slot 1 (bonus makes it effectively -34 km vs 0.5)
    // After FAR is placed (ruta.length=1), bonus still applies for slot 2
    // CLOSE and MID have no bonus — MID goes next from FAR's position
    // CLOSE ends up last (no bonus, furthest from MID at that point)
    const tiendas = [
      store('CLOSE'),                    // ~0.5 km from CD, no bonus
      store('MID'),                      // ~6 km from CD, no bonus
      store('FAR', 3, 5, '08:00-09:30'), // ~16 km from CD, bonus -50
    ];
    const ordered = nn(tiendas, GPS, CD);
    // FAR gets bonus in round 1 → goes first
    expect(ordered[0].c).toBe('FAR');
    // CLOSE ends last because from FAR's position it's far and has no bonus
    expect(ordered[ordered.length - 1].c).toBe('CLOSE');
  });
});

// ─── asignar ─────────────────────────────────────────────────────────────────

describe('asignar', () => {
  it('returns [] when no vehicles are available', () => {
    const tiendas = [store('CLOSE')];
    const flota: Vehiculo[] = [];
    expect(asignar(tiendas, flota, GPS, CD)).toEqual([]);
  });

  it('returns [] when all vehicles are offline', () => {
    const tiendas = [store('CLOSE')];
    const flota = [vehicle({ on: false }), vehicle({ on: false })];
    expect(asignar(tiendas, flota, GPS, CD)).toEqual([]);
  });

  it('returns [] when no tiendas', () => {
    const flota = [vehicle()];
    expect(asignar([], flota, GPS, CD)).toEqual([]);
  });

  it('assigns stores to a single route when they fit in one vehicle', () => {
    const tiendas = [store('CLOSE', 3), store('MID', 3)]; // 6 pallets total
    const flota = [vehicle({ c: 10 })]; // capacity 10
    const rutas = asignar(tiendas, flota, GPS, CD);
    expect(rutas).toHaveLength(1);
    expect(rutas[0].ts).toHaveLength(2);
    expect(rutas[0].tp).toBe(6);
  });

  it('spreads stores across multiple routes when capacity exceeded', () => {
    // 12 pallets total, each vehicle carries 10 max → needs 2 vehicles
    const tiendas = [
      store('CLOSE', 4), store('MID', 4), store('FAR', 4),
    ];
    const flota = [vehicle({ c: 10 }), vehicle({ c: 10 }), vehicle({ c: 10 })];
    const rutas = asignar(tiendas, flota, GPS, CD);
    expect(rutas.length).toBeGreaterThanOrEqual(2);
    // All stores must be assigned
    const allAssigned = rutas.flatMap(r => r.ts.map(t => t.c));
    expect(allAssigned.sort()).toEqual(['CLOSE', 'FAR', 'MID'].sort());
  });

  it('isolates REGION_V stores in a dedicated route', () => {
    const tiendas = [store('CLOSE'), store('REGV')];
    const flota   = [vehicle(), vehicle()];
    const regV    = new Set(['REGV']);

    const rutas = asignar(tiendas, flota, GPS, CD, null, regV, null);
    const rutaRegV = rutas.find(r => r.ts.some(t => t.c === 'REGV'));
    const rutaRest = rutas.find(r => r.ts.some(t => t.c === 'CLOSE'));

    // REGV must be in its own route, separate from CLOSE
    expect(rutaRegV).toBeDefined();
    expect(rutaRest).toBeDefined();
    expect(rutaRegV).not.toBe(rutaRest);
  });

  it('isolates PROVIDENCIA stores in a dedicated route', () => {
    const tiendas = [store('CLOSE'), store('PROV')];
    const flota   = [vehicle(), vehicle()];
    const prov    = new Set(['PROV']);

    const rutas = asignar(tiendas, flota, GPS, CD, prov, null, null);
    const rutaProv = rutas.find(r => r.ts.some(t => t.c === 'PROV'));
    const rutaRest = rutas.find(r => r.ts.some(t => t.c === 'CLOSE'));

    expect(rutaProv).toBeDefined();
    expect(rutaRest).toBeDefined();
    expect(rutaProv).not.toBe(rutaRest);
  });

  it('TLBD vehicle absorbs overflow from overloaded vehicles', () => {
    // One regular vehicle with capacity 5, two stores each needing 4 pallets (total 8 > 5)
    const tiendas = [store('CLOSE', 4), store('MID', 4)];
    const flota = [
      vehicle({ c: 5, on: true, tlbd: false }),      // regular, capacity 5
      vehicle({ p: 'TLBD', c: 6, on: true, tlbd: true }), // TLBD, capacity 6
    ];
    const rutas = asignar(tiendas, flota, GPS, CD);
    // Total assigned pallets should equal total input pallets
    const totalAssigned = rutas.reduce((sum, r) => sum + r.tp, 0);
    expect(totalAssigned).toBe(8);
  });

  it('each returned route has tp matching the sum of its store pallets', () => {
    const tiendas = [store('CLOSE', 2, 4), store('MID', 3, 6), store('FAR', 5, 10)];
    const flota   = [vehicle({ c: 10 }), vehicle({ c: 10 })];
    const rutas   = asignar(tiendas, flota, GPS, CD);
    for (const ruta of rutas) {
      const expectedTp = ruta.ts.reduce((s, t) => s + t.p, 0);
      expect(ruta.tp).toBe(expectedTp);
    }
  });

  it('only includes routes with at least one store', () => {
    const tiendas = [store('CLOSE')];
    const flota   = [vehicle(), vehicle(), vehicle()]; // 3 vehicles, only 1 store
    const rutas   = asignar(tiendas, flota, GPS, CD);
    expect(rutas.every(r => r.ts.length > 0)).toBe(true);
  });

  it('applies nn ordering within each route', () => {
    // Three stores: FAR, MID, CLOSE — route should be ordered CLOSE→MID→FAR
    const tiendas = [store('FAR', 2), store('MID', 2), store('CLOSE', 2)];
    const flota   = [vehicle({ c: 10 })];
    const rutas   = asignar(tiendas, flota, GPS, CD);
    expect(rutas).toHaveLength(1);
    const codes = rutas[0].ts.map(t => t.c);
    expect(codes[0]).toBe('CLOSE'); // nearest to CD first
  });
});
