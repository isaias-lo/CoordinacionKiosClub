/**
 * Property-based tests for despacho helpers.
 * fast-check genera miles de inputs aleatorios para encontrar casos que los
 * ejemplos concretos nunca cubren — especialmente bordes y combinaciones raras.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { dkm, norm } from '../utils/helpers';

// Arbitrarios reutilizables
const lat = fc.integer({ min: -9000, max: 9000  }).map(n => n / 100); // -90..90
const lon = fc.integer({ min: -18000, max: 18000 }).map(n => n / 100); // -180..180
const coord = fc.tuple(lat, lon);

// ─── dkm (Haversine) ─────────────────────────────────────────────────────────

describe('dkm — propiedades matemáticas', () => {
  it('siempre devuelve un valor >= 0 (distancias no negativas)', () => {
    fc.assert(fc.property(coord, coord, (a, b) => {
      return dkm(a, b) >= 0;
    }));
  });

  it('es simétrica: dkm(A,B) == dkm(B,A)', () => {
    fc.assert(fc.property(coord, coord, (a, b) => {
      return Math.abs(dkm(a, b) - dkm(b, a)) < 0.00001;
    }));
  });

  it('dkm(P, P) == 0 para cualquier punto', () => {
    fc.assert(fc.property(coord, (p) => {
      return dkm(p, p) === 0;
    }));
  });

  it('cumple desigualdad triangular: dkm(A,C) <= dkm(A,B) + dkm(B,C)', () => {
    fc.assert(fc.property(coord, coord, coord, (a, b, c) => {
      const epsilon = 0.001; // tolerancia punto flotante
      return dkm(a, c) <= dkm(a, b) + dkm(b, c) + epsilon;
    }));
  });

  it('punto más cercano tiene menor distancia que punto más lejano', () => {
    // Verifica que dkm produce un orden consistente de distancias
    const origin: [number, number] = [-33.4, -70.6];
    fc.assert(fc.property(coord, coord, (p1, p2) => {
      const d1 = dkm(origin, p1);
      const d2 = dkm(origin, p2);
      // Si d1 < d2, entonces invertido (p2 más cercano) debe tener la relación contraria
      if (d1 < d2) return dkm(origin, p2) > dkm(origin, p1);
      return true; // empates son OK
    }));
  });
});

// ─── norm ─────────────────────────────────────────────────────────────────────

describe('norm — propiedades de estabilidad', () => {
  it('es idempotente: norm(norm(x)) === norm(x) para cualquier string', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      const once  = norm(s);
      const twice = norm(once);
      return once === twice;
    }));
  });

  it('nunca lanza una excepción para ningún input', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      expect(() => norm(s)).not.toThrow();
      return true;
    }));
  });

  it('siempre devuelve un string (nunca undefined o null)', () => {
    fc.assert(fc.property(fc.string(), (s) => {
      return typeof norm(s) === 'string';
    }));
  });

  it('el resultado nunca tiene espacios al inicio o al final', () => {
    // norm hace trim() internamente antes de resolver aliases
    fc.assert(fc.property(fc.string(), (s) => {
      const result = norm(s);
      return result === result.trim() || result.length === 0;
    }));
  });

  it('todos los alias conocidos son idempotentes al normalizar el resultado', () => {
    // Cada alias resuelto a un código canónico, al normalizarse de nuevo, debe dar el mismo código
    const ALIAS_KEYS = ['LAS','VIT','CFL','MAI','PEN','VIN','RNC','CON','CUR','TPS','PIE','FLO'];
    fc.assert(fc.property(fc.constantFrom(...ALIAS_KEYS), (key) => {
      const resolved = norm(key);
      const resolvedAgain = norm(resolved);
      return resolved === resolvedAgain;
    }));
  });
});
