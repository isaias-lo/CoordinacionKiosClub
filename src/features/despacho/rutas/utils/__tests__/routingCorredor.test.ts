import { describe, it, expect } from 'vitest';
import { asignar } from '../routing';
import type { StoreItem } from '../routing';
import type { Vehiculo } from '../../data/flota';

const CD: [number, number] = [-33.412581, -70.632438];

function store(c: string, p = 3, b = 0): StoreItem { return { c, p, b }; }
function vehicle(o: Partial<Vehiculo> = {}): Vehiculo {
  return { p: 'T', c: 10, b: 20, t: 'Camión', tlbd: false, on: true, porton: null, refrigerado: false, empresa: '', ...o };
}

// 2 tiendas en ORIENTE (Las Condes) + 2 en PONIENTE (Quilicura), códigos fuera de todo set curado.
const GPS: Record<string, number[]> = {
  OA1: [-33.401, -70.551], OA2: [-33.403, -70.549], // Oriente
  PB1: [-33.361, -70.731], PB2: [-33.359, -70.729], // Poniente
};
const TS = [store('OA1'), store('OA2'), store('PB1'), store('PB2')];
const FLOTA = [vehicle({ p: 'T1', c: 10 }), vehicle({ p: 'T2', c: 10 })];

describe('asignar — Fase 2 (agrupar por corredor, opt-in)', () => {
  it('NO-REGRESIÓN: flag apagado (default) === flag apagado explícito (byte-idéntico)', () => {
    const porDefault  = asignar(TS, FLOTA, GPS, CD);
    const explicitOff = asignar(TS, FLOTA, GPS, CD, null, null, null, undefined, false);
    expect(porDefault).toEqual(explicitOff);
  });

  it('flag ENCENDIDO: ningún camión mezcla corredores (Oriente y Poniente van separados)', () => {
    const rOn = asignar(TS, FLOTA, GPS, CD, null, null, null, undefined, true);
    const oriente = new Set(['OA1', 'OA2']);
    for (const r of rOn) {
      const cods = r.ts.map(t => t.c);
      const nOriente = cods.filter(c => oriente.has(c)).length;
      // o todas de Oriente, o ninguna → no se mezclan corredores en un mismo camión
      expect(nOriente === 0 || nOriente === cods.length).toBe(true);
    }
    // todas las tiendas siguen ruteadas (no se pierde ninguna)
    const todas = rOn.flatMap(r => r.ts.map(t => t.c)).sort();
    expect(todas).toEqual(['OA1', 'OA2', 'PB1', 'PB2']);
  });

  it('flag encendido NO pierde ni duplica tiendas', () => {
    const rOn = asignar(TS, FLOTA, GPS, CD, null, null, null, undefined, true);
    const cods = rOn.flatMap(r => r.ts.map(t => t.c));
    expect(new Set(cods).size).toBe(cods.length); // sin duplicados
    expect(cods.length).toBe(4);
  });
});
