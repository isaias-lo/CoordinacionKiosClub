/**
 * Property-based tests para el algoritmo central de asignación de rutas.
 *
 * La propiedad más crítica: ningún despacho puede perderse.
 * Si asignar() pierde un store, se genera una ruta vacía o un despacho incompleto
 * — y eso pasaría silenciosamente sin tests de propiedades.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { asignar, nn } from '../utils/routing';
import type { Vehiculo } from '../data/flota';

// ─── Fixtures fijos ───────────────────────────────────────────────────────────

const CD: [number, number] = [-33.412581, -70.632438];

// 5 tiendas ficticias con coordenadas reales para que dkm funcione correctamente
const TEST_GPS: Record<string, number[]> = {
  A: [-33.415, -70.635], // ~0.5 km del CD
  B: [-33.440, -70.655], // ~4 km
  C: [-33.470, -70.680], // ~8 km
  D: [-33.510, -70.710], // ~14 km
  E: [-33.550, -70.740], // ~20 km
};

const CODES = ['A', 'B', 'C', 'D', 'E'] as const;

// ─── Arbitrarios ─────────────────────────────────────────────────────────────

const storeArb = fc.record({
  c: fc.constantFrom(...CODES),
  p: fc.integer({ min: 1, max: 5 }),
  b: fc.integer({ min: 1, max: 10 }),
});

// Tiendas únicas por código (sin duplicados de código de tienda)
const uniqueTiendasArb = fc.uniqueArray(storeArb, {
  selector:  t => t.c,
  minLength: 1,
  maxLength: 5,
});

// Vehículo activo con capacidad aleatoria
const vehicleArb = fc.record({
  plate: fc.constantFrom('V1', 'V2', 'V3', 'V4', 'V5'),
  cap:   fc.integer({ min: 4, max: 15 }),
}).map(({ plate, cap }) => ({
  p: plate, c: cap, b: cap * 2,
  t: 'Test', tlbd: false, on: true,
  porton: null, refrigerado: false, empresa: '',
}) as Vehiculo);

const flotaArb = fc.uniqueArray(vehicleArb, {
  selector:  v => v.p,
  minLength: 1,
  maxLength: 4,
});

// ─── nn — propiedades ─────────────────────────────────────────────────────────

describe('nn — propiedades', () => {
  it('preserva exactamente los mismos stores (ninguno se pierde ni se duplica)', () => {
    fc.assert(fc.property(uniqueTiendasArb, (tiendas) => {
      const ordered = nn(tiendas, TEST_GPS, CD);
      const inputCodes  = tiendas.map(t => t.c).sort();
      const outputCodes = ordered.map(t => t.c).sort();
      expect(outputCodes).toEqual(inputCodes);
    }));
  });

  it('devuelve el mismo número de stores que recibe', () => {
    fc.assert(fc.property(uniqueTiendasArb, (tiendas) => {
      return nn(tiendas, TEST_GPS, CD).length === tiendas.length;
    }));
  });
});

// ─── asignar — propiedad de conservación (la más crítica) ────────────────────

describe('asignar — propiedades', () => {
  it('CONSERVACIÓN: nunca pierde ni duplica stores (todos quedan asignados)', () => {
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      const rutas = asignar(tiendas, flota, TEST_GPS, CD, null, null, null);

      const assigned = rutas.flatMap(r => r.ts.map(t => t.c)).sort();
      const expected = tiendas.map(t => t.c).sort();

      expect(assigned).toEqual(expected);
    }));
  });

  it('tp de cada ruta coincide exactamente con la suma de pallets de sus tiendas', () => {
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      const rutas = asignar(tiendas, flota, TEST_GPS, CD, null, null, null);
      return rutas.every(r => r.tp === r.ts.reduce((s, t) => s + t.p, 0));
    }));
  });

  it('tb de cada ruta coincide con la suma de bultos+chocolates de sus tiendas', () => {
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      const rutas = asignar(tiendas, flota, TEST_GPS, CD, null, null, null);
      return rutas.every(r => r.tb === r.ts.reduce((s, t) => s + t.b + (t.ch ?? 0), 0));
    }));
  });

  it('ninguna ruta retornada tiene cero tiendas (no hay rutas fantasma)', () => {
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      const rutas = asignar(tiendas, flota, TEST_GPS, CD, null, null, null);
      return rutas.every(r => r.ts.length > 0);
    }));
  });

  it('el número de rutas nunca supera el número de vehículos disponibles', () => {
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      const activos = flota.filter(v => v.on && !v.tlbd).length;
      const rutas   = asignar(tiendas, flota, TEST_GPS, CD, null, null, null);
      // +1 por el posible vehículo TLBD extra que se agrega en overflow
      return rutas.length <= activos + 1;
    }));
  });

  it('INVARIANTE: total de pallets asignados == total de pallets de entrada', () => {
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      const totalEntrada  = tiendas.reduce((s, t) => s + t.p, 0);
      const rutas         = asignar(tiendas, flota, TEST_GPS, CD, null, null, null);
      const totalAsignado = rutas.reduce((s, r) => s + r.tp, 0);
      expect(totalAsignado).toBe(totalEntrada);
    }));
  });

  it('el algoritmo siempre termina sin lanzar excepción para cualquier combinación de tiendas y flota', () => {
    // Verifica robustez: nn + asignar nunca se rompen con inputs válidos arbitrarios
    fc.assert(fc.property(uniqueTiendasArb, flotaArb, (tiendas, flota) => {
      expect(() => asignar(tiendas, flota, TEST_GPS, CD, null, null, null)).not.toThrow();
      return true;
    }));
  });
});
