import { describe, it, expect } from 'vitest';
import {
  ordenarConVentanas, costoDeOrden, compararCosto, llegadas, type TiendaParaOrden,
} from '../ordenConVentanas';

// ── El caso real del lunes (captura del Planificador) ────────────────────────────
// CD Kios Club en Recoleta. Coordenadas aproximadas pero con las posiciones relativas reales:
// PZA y ITA cerca del centro; CFL y FLO al sur; PEÑ al oriente; PTA al sur-oriente lejos;
// MAI al poniente lejos.
const CD: [number, number] = [-33.41328, -70.63337];
const GPS: Record<string, number[]> = {
  '56PZA': [-33.4372, -70.6506],  // Plaza de Armas — centro
  '55ITA': [-33.4419, -70.6290],  // Barrio Italia — centro oriente
  '29CFL': [-33.5206, -70.5981],  // Florida Center — sur
  '18FLO': [-33.5254, -70.5875],  // Florida — sur (pegado a CFL)
  '23PEÑ': [-33.4870, -70.5340],  // Peñalolén — oriente
  '49PTA': [-33.5760, -70.5760],  // Puente Alto — sur lejos
  '17MAI': [-33.4890, -70.7540],  // Maipú — poniente lejos
};
const TIENDAS: Record<string, TiendaParaOrden> = {
  '56PZA': { v: '09:00-12:00', tipo: 'STRIPCENTER' },
  '55ITA': { v: '09:00-12:00', tipo: 'STRIPCENTER' },
  '29CFL': { v: '08:30-09:30', tipo: 'MALL' },
  '18FLO': { v: '09:30-12:00', tipo: 'STRIPCENTER' },
  '23PEÑ': { v: '09:00-11:00', tipo: 'STRIPCENTER' },
  '49PTA': { v: '08:30-09:30', tipo: 'STRIPCENTER' },
  '17MAI': { v: '08:30-09:30', tipo: 'MALL' },
};
const CODS = Object.keys(TIENDAS);
const SALIDA = 8 * 60 + 30;   // 08:30
const base = { salidaMin: SALIDA, velocidadKmH: 22 };

/** El orden que dio el Planificador por cercanía, tal cual la captura. */
const ORDEN_CERCANIA = ['56PZA', '55ITA', '29CFL', '18FLO', '23PEÑ', '49PTA', '17MAI'];

describe('el caso del lunes con atención razonable', () => {
  const o = { ...base, servicioMin: 15 };

  it('los MALL dejan de caer al final', () => {
    const orden = ordenarConVentanas(CODS, GPS, CD, TIENDAS, o);
    const posMall = (c: string) => orden.indexOf(c);
    // Con 15 min alcanza para llegar temprano a los de ventana 08:30-09:30.
    expect(posMall('29CFL')).toBeLessThan(orden.indexOf('56PZA'));
    expect(posMall('17MAI')).toBeLessThan(orden.indexOf('55ITA'));
  });

  it('mejora —o al menos iguala— el costo del orden por cercanía', () => {
    const o2 = { ...o };
    const cercania = costoDeOrden(ORDEN_CERCANIA, GPS, CD, TIENDAS, o2);
    const nuevo    = costoDeOrden(ordenarConVentanas(CODS, GPS, CD, TIENDAS, o2), GPS, CD, TIENDAS, o2);
    expect(compararCosto(nuevo, cercania)).toBeLessThanOrEqual(0);
  });

  it('incumple MENOS ventanas duras que el orden por cercanía', () => {
    const cercania = costoDeOrden(ORDEN_CERCANIA, GPS, CD, TIENDAS, o);
    const nuevo    = costoDeOrden(ordenarConVentanas(CODS, GPS, CD, TIENDAS, o), GPS, CD, TIENDAS, o);
    expect(nuevo.durasIncumplidas).toBeLessThanOrEqual(cercania.durasIncumplidas);
  });
});

describe('el día imposible: 40 min/parada', () => {
  // Con 40 min y salida 08:30 solo UNA parada cabe antes de las 09:30, y hay TRES tiendas con
  // esa ventana. No existe orden que las cumpla — el Handoff lo llama "imposibilidad aritmética".
  const o = { ...base, servicioMin: 40 };

  it('sigue devolviendo un orden, no se rinde', () => {
    const orden = ordenarConVentanas(CODS, GPS, CD, TIENDAS, o);
    expect(orden).toHaveLength(CODS.length);
    expect([...orden].sort()).toEqual([...CODS].sort());
  });

  it('cuando ninguna opción cumple, minimiza los minutos de atraso', () => {
    const nuevo = costoDeOrden(ordenarConVentanas(CODS, GPS, CD, TIENDAS, o), GPS, CD, TIENDAS, o);
    const cercania = costoDeOrden(ORDEN_CERCANIA, GPS, CD, TIENDAS, o);
    // Puede no bajar el número de incumplidas (es imposible), pero no debe empeorar el total.
    expect(compararCosto(nuevo, cercania)).toBeLessThanOrEqual(0);
  });
});

describe('compararCosto — el orden de prioridades', () => {
  const c = (d: number, md: number, mb: number, km: number) =>
    ({ durasIncumplidas: d, minutosTardeDuras: md, minutosTardeBlandas: mb, km });

  it('una ventana dura incumplida pesa más que cualquier kilometraje', () => {
    expect(compararCosto(c(0, 0, 0, 500), c(1, 5, 0, 10))).toBeLessThan(0);
  });

  it('a igual cantidad de duras incumplidas, gana la que llega menos tarde', () => {
    expect(compararCosto(c(2, 30, 0, 10), c(2, 90, 0, 10))).toBeLessThan(0);
  });

  it('las blandas desempatan antes que los km', () => {
    expect(compararCosto(c(0, 0, 5, 100), c(0, 0, 50, 10))).toBeLessThan(0);
  });

  it('con todo igual, gana el que hace menos km', () => {
    expect(compararCosto(c(0, 0, 0, 90), c(0, 0, 0, 100))).toBeLessThan(0);
  });

  it('dos costos idénticos empatan', () => {
    expect(compararCosto(c(1, 2, 3, 4), c(1, 2, 3, 4))).toBe(0);
  });
});

describe('llegadas', () => {
  const o = { ...base, servicioMin: 15 };

  it('la primera parada cuenta solo el manejo desde el CD', () => {
    const [primera] = llegadas(['56PZA'], GPS, CD, TIENDAS, o);
    expect(primera).toBeGreaterThan(SALIDA);
  });

  it('el camión ESPERA a que la tienda abra: la atención no corre en la puerta', () => {
    // Una tienda que abre 10:00 con el camión llegando mucho antes.
    const t = { X: { v: '10:00-12:00', tipo: 'STRIPCENTER' }, Y: { v: '', tipo: 'STRIPCENTER' } };
    const g = { X: [-33.4132, -70.6334], Y: [-33.4132, -70.6334] };  // ambas en el CD: viaje 0
    const [, segunda] = llegadas(['X', 'Y'], g, CD, t, { ...base, servicioMin: 15 });
    // Llega a X a las 08:30, espera hasta 10:00, descarga 15 → sale 10:15 → llega a Y 10:15.
    expect(segunda).toBe(10 * 60 + 15);
  });

  it('sin ventana no espera: descarga apenas llega', () => {
    const t = { X: { v: '', tipo: 'STRIPCENTER' }, Y: { v: '', tipo: 'STRIPCENTER' } };
    const g = { X: [-33.4132, -70.6334], Y: [-33.4132, -70.6334] };
    const [, segunda] = llegadas(['X', 'Y'], g, CD, t, { ...base, servicioMin: 15 });
    expect(segunda).toBe(SALIDA + 15);
  });

  it('el servicioMin del coordinador manda: cambiarlo cambia las horas', () => {
    const t = { X: { v: '' }, Y: { v: '' } };
    const g = { X: [-33.4132, -70.6334], Y: [-33.4132, -70.6334] };
    expect(llegadas(['X', 'Y'], g, CD, t, { ...base, servicioMin: 20 })[1]).toBe(SALIDA + 20);
    expect(llegadas(['X', 'Y'], g, CD, t, { ...base, servicioMin: 45 })[1]).toBe(SALIDA + 45);
  });
});

describe('casos de borde', () => {
  const o = { ...base, servicioMin: 15 };

  it('una sola parada se devuelve tal cual', () => {
    expect(ordenarConVentanas(['56PZA'], GPS, CD, TIENDAS, o)).toEqual(['56PZA']);
  });

  it('sin paradas no revienta', () => {
    expect(ordenarConVentanas([], GPS, CD, TIENDAS, o)).toEqual([]);
  });

  it('no pierde ni duplica paradas', () => {
    const orden = ordenarConVentanas(CODS, GPS, CD, TIENDAS, o);
    expect(new Set(orden).size).toBe(CODS.length);
  });

  it('una tienda SIN coordenada se conserva en la ruta', () => {
    const cods = [...CODS, 'SINGPS'];
    const tiendas = { ...TIENDAS, SINGPS: { v: '09:00-12:00', tipo: 'STRIPCENTER' } };
    expect(ordenarConVentanas(cods, GPS, CD, tiendas, o)).toContain('SINGPS');
  });

  it('una tienda sin ventana no genera incumplimiento', () => {
    const t = { X: { v: null, tipo: 'MALL' } };
    const g = { X: [-33.6, -70.9] };   // lejísimos: llegaría tardísimo si tuviera ventana
    expect(costoDeOrden(['X'], g, CD, t, o).durasIncumplidas).toBe(0);
  });

  it('la dureza explícita gana sobre el formato', () => {
    const g = { X: [-33.6, -70.9] };
    const tarde = { v: '08:30-08:45' };   // imposible de cumplir
    // Un STRIPCENTER marcado como duro cuenta como dura.
    expect(costoDeOrden(['X'], g, CD, { X: { ...tarde, tipo: 'STRIPCENTER', dureza: 'dura' } }, o).durasIncumplidas).toBe(1);
    // Un MALL marcado como blando NO cuenta como dura.
    expect(costoDeOrden(['X'], g, CD, { X: { ...tarde, tipo: 'MALL', dureza: 'blanda' } }, o).durasIncumplidas).toBe(0);
  });
});
