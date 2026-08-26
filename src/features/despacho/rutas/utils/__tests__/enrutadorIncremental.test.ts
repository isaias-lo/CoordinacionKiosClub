import { describe, it, expect } from 'vitest';
import {
  esperadoDesdeHistorial, empresaHabitual, acumular, estadoTienda, ordenDeCarga,
  posicionMaximaTardia, planificarIncremental, rutasDelPlan, INCREMENTAL_DEFAULT,
  type UnidadSalida, type EsperadoTienda, type DespachoPasado,
} from '../enrutadorIncremental';
import type { Vehiculo } from '../../data/flota';

const CD: [number, number] = [-33.412581, -70.632438];
const GPS: Record<string, number[]> = {
  A: [-33.4126, -70.6324], B: [-33.4126, -70.6224], C: [-33.4126, -70.6124], D: [-33.4126, -70.6024],
};
const O = INCREMENTAL_DEFAULT;
const V = (p: string, c = 10, b = 20, extra: Partial<Vehiculo> = {}): Vehiculo => ({
  p, c, b, t: 'Camión', tlbd: false, on: true, porton: null, refrigerado: false, empresa: '', ...extra,
});
const U = (cod: string, tipo: UnidadSalida['tipo'], minuto: number): UnidadSalida => ({ cod, tipo, minuto });
const H = (esperado: number, techoPallets = esperado + 1, extra: Partial<EsperadoTienda> = {}): EsperadoTienda =>
  ({ esperado, techoPallets, ...extra });
const D = (empresa: string, diasAtras: number): DespachoPasado => ({ empresa, diasAtras });

describe('esperadoDesdeHistorial', () => {
  it('usa la MEDIANA de los días observados, no el promedio', () => {
    expect(esperadoDesdeHistorial([3, 3, 3]).esperado).toBe(3);
    // cola larga: el promedio de [1,1,1,9] es 3 pero la mayoría de los días son 1
    expect(esperadoDesdeHistorial([1, 1, 1, 9]).esperado).toBe(1);
  });
  it('el techo cubre por encima del promedio', () => {
    const r = esperadoDesdeHistorial([1, 3, 5]);
    expect(r.esperado).toBe(3);
    expect(r.techoPallets).toBeGreaterThan(r.esperado);
  });
  it('con volumen constante el techo es apenas uno más', () => {
    expect(esperadoDesdeHistorial([4, 4, 4]).techoPallets).toBe(5);
  });
  it('el techo se calcula solo sobre PALLETS, no sobre todas las unidades', () => {
    // 10 unidades por día, de las cuales 2 son pallets: reservar 10 desperdiciaría el camión.
    const r = esperadoDesdeHistorial([10, 10, 10], [2, 2, 2]);
    expect(r.esperado).toBe(10);
    expect(r.techoPallets).toBe(3);
  });
  it('tienda nueva: se marca sin historial y reserva un default', () => {
    expect(esperadoDesdeHistorial([])).toEqual({ esperado: 0, techoPallets: 2, sinHistorial: true });
    expect(esperadoDesdeHistorial([], [], 4).techoPallets).toBe(4);
  });
  it('con historial no se marca como nueva', () => {
    expect(esperadoDesdeHistorial([3, 3]).sinHistorial).toBe(false);
  });
  it('ignora valores inválidos', () => {
    expect(esperadoDesdeHistorial([2, NaN, -1, 4] as number[]).esperado).toBe(4);
  });
});

describe('empresaHabitual', () => {
  it('elige la empresa más frecuente con su confianza', () => {
    const r = empresaHabitual([D('Luis Fica',0), D('Luis Fica',0), D('Luis Fica',0), D('Ortiz',0)]);
    expect(r!.empresa).toBe('Luis Fica');
    expect(r!.confianza).toBeCloseTo(0.75, 6);
  });
  it('con una sola empresa la confianza es total', () => {
    expect(empresaHabitual([D('Ortiz',0), D('Ortiz',10)])).toEqual({ empresa: 'Ortiz', confianza: 1 });
  });

  // El caso real: Falabella hacía estas rutas y ahora las hace Luis Fica. Contando los 60 días por
  // igual el enrutador seguiría proponiendo Falabella.
  it('lo reciente le gana a lo antiguo aunque lo antiguo sea más numeroso', () => {
    const hist = [
      D('Falabella', 60), D('Falabella', 58), D('Falabella', 55), D('Falabella', 52), D('Falabella', 50),
      D('Luis Fica', 3), D('Luis Fica', 2), D('Luis Fica', 1),
    ];
    expect(empresaHabitual(hist)!.empresa).toBe('Luis Fica');
  });
  it('sin ponderar recencia ganaría la empresa antigua', () => {
    const hist = [
      D('Falabella', 60), D('Falabella', 58), D('Falabella', 55), D('Falabella', 52), D('Falabella', 50),
      D('Luis Fica', 3), D('Luis Fica', 2), D('Luis Fica', 1),
    ];
    expect(empresaHabitual(hist, 1e9)!.empresa).toBe('Falabella');
  });
  it('una semivida más corta reacciona más rápido al cambio', () => {
    const hist = [D('Falabella', 40), D('Falabella', 38), D('Luis Fica', 5)];
    expect(empresaHabitual(hist, 7)!.empresa).toBe('Luis Fica');
    expect(empresaHabitual(hist, 200)!.empresa).toBe('Falabella');
  });

  it('sin historial devuelve null', () => {
    expect(empresaHabitual([])).toBeNull();
    expect(empresaHabitual([D('',0), D('  ',0)])).toBeNull();
  });
  it('rompe empates de forma determinista', () => {
    expect(empresaHabitual([D('B',0), D('A',0)])!.empresa).toBe('A');
    expect(empresaHabitual([D('A',0), D('B',0)])!.empresa).toBe('A');
  });
});

describe('acumular', () => {
  it('separa los cuatro tipos de carga', () => {
    const a = acumular([U('A','P',600), U('A','B',610), U('A','CH',620), U('A','C',630)]);
    expect(a.A.p).toBe(1); expect(a.A.b).toBe(1); expect(a.A.ch).toBe(1); expect(a.A.c_).toBe(1);
  });
  it('guarda el minuto de la última unidad', () => {
    expect(acumular([U('A','P',600), U('A','P',700), U('A','P',650)]).A.ultimo).toBe(700);
  });
  it('agrupa por tienda', () => {
    const a = acumular([U('A','P',600), U('B','P',601)]);
    expect(Object.keys(a).sort()).toEqual(['A','B']);
  });
  it('sin unidades devuelve vacío', () => {
    expect(acumular([])).toEqual({});
  });
});

describe('estadoTienda', () => {
  it('espera mientras falte carga', () => {
    expect(estadoTienda(1, 3, 600, 660, O)).toBe('esperando');
  });
  it('sin nada recibido siempre espera', () => {
    expect(estadoTienda(0, 0, -1, 660, O)).toBe('esperando');
  });
  it('recién alcanzado lo esperado queda como probable', () => {
    expect(estadoTienda(3, 3, 650, 660, O)).toBe('probable');
  });
  it('alcanzado lo esperado y en silencio, se da por completa', () => {
    expect(estadoTienda(3, 3, 600, 600 + O.silencioMin, O)).toBe('completa');
  });
  it('una tienda sin historial no se cierra antes del corte', () => {
    expect(estadoTienda(3, 0, 600, 600 + O.silencioMin, O, true)).toBe('esperando');
    expect(estadoTienda(3, 0, 600, 600 + O.silencioMin, O, false)).toBe('completa');
  });
  it('pasado el corte se cierra igual, aunque falte', () => {
    expect(estadoTienda(1, 9, 600, O.corteCierre, O)).toBe('completa');
  });
  it('recibir de más también cuenta como alcanzado', () => {
    expect(estadoTienda(5, 3, 600, 600 + O.silencioMin, O)).toBe('completa');
  });
});

describe('ordenDeCarga', () => {
  it('carga al revés de como entrega: la última parada va al fondo', () => {
    expect(ordenDeCarga(['CHL','TRE','SP2','MCH'])).toEqual(['MCH','SP2','TRE','CHL']);
  });
  it('no altera el orden de entrega original', () => {
    const entrega = ['A','B','C'];
    ordenDeCarga(entrega);
    expect(entrega).toEqual(['A','B','C']);
  });
  it('con una parada es igual', () => {
    expect(ordenDeCarga(['A'])).toEqual(['A']);
  });
});

describe('posicionMaximaTardia', () => {
  it('en un camión vacío la tienda tardía puede ir en cualquier lado', () => {
    expect(posicionMaximaTardia(0)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('en un camión ya cargado solo puede entrar en la puerta (primera entrega)', () => {
    expect(posicionMaximaTardia(3)).toBe(0);
  });
});

describe('planificarIncremental', () => {
  const flota = [V('T1'), V('T2')];
  const opts = { maxDiametroKm: 0, respetarVentanas: false };

  it('sin mercadería avisa y no arma nada', () => {
    const p = planificarIncremental([], flota, GPS, CD, undefined, {}, 600, opts);
    expect(p.camiones).toEqual([]);
    expect(p.avisos[0]).toContain('Todavía no sale');
  });

  it('rutea con lo que salió hasta ahora', () => {
    const u = [U('A','P',600), U('B','P',610)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(1), B: H(1) }, 700, opts);
    expect(p.camiones.flatMap(k => k.orden).sort()).toEqual(['A','B']);
  });

  it('marca listo el camión cuyas tiendas están completas', () => {
    const u = [U('A','P',600), U('B','P',600)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(1), B: H(1) }, 600 + O.silencioMin, opts);
    expect(p.camiones.every(k => k.estado === 'listo')).toBe(true);
    expect(p.avisos[0]).toContain('se puede');
  });

  it('deja abierto el camión al que le falta carga, y dice cuál', () => {
    const u = [U('A','P',600), U('B','P',600)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(1), B: H(5) }, 700, opts);
    const abierto = p.camiones.find(k => k.estado === 'abierto');
    expect(abierto).toBeDefined();
    expect(abierto!.motivo).toContain('B');
  });

  it('reserva capacidad para lo que todavía no sale', () => {
    // esperado 4 unidades, salió 1 → sigue "esperando" → reserva su techo de 6 pallets
    const p = planificarIncremental([U('A','P',600)], flota, GPS, CD, undefined, { A: H(4, 6) }, 610, opts);
    expect(p.camiones[0].reservado).toBe(5);
  });

  it('no reserva nada cuando la tienda ya está completa', () => {
    const u = [U('A','P',600)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(1, 6) }, 600 + O.silencioMin, opts);
    expect(p.camiones[0].reservado).toBe(0);
  });

  it('los bultos y chocolates no limitan la capacidad del camión', () => {
    // Un camión chico (2 pallets) con muchísimos bultos: igual entra todo en un solo viaje.
    const chico = [V('CHICO', 2, 20)];
    const u = [U('A','P',600), U('B','P',600),
               ...Array.from({length: 40}, (_, i) => U('A','B', 600 + i))];
    const p = planificarIncremental(u, chico, GPS, CD, undefined, { A: H(41), B: H(1) }, 700, opts);
    expect(p.camiones).toHaveLength(1);
    expect(p.camiones[0].tb).toBe(40);
  });

  it('pasada la hora de corte manda cerrar todo', () => {
    const u = [U('A','P',600)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(9) }, O.corteCierre, opts);
    expect(p.camiones[0].estado).toBe('cerrar-ya');
    expect(p.camiones[0].motivo).toContain('corte');
  });

  it('cuenta los contenedores como pallets (hoy el enrutador los pierde)', () => {
    const u = [U('A','C',600), U('A','C',601)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(2) }, 700, opts);
    expect(p.camiones[0].tp).toBe(2);
  });

  it('cuenta los chocolates como bultos', () => {
    const u = [U('A','CH',600), U('A','B',601)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(2) }, 700, opts);
    expect(p.camiones[0].tb).toBe(2);
  });

  it('el orden de carga es el inverso del de entrega', () => {
    const u = [U('A','P',600), U('B','P',600), U('C','P',600)];
    const p = planificarIncremental(u, flota, GPS, CD, undefined, { A: H(1), B: H(1), C: H(1) }, 700, opts);
    for (const k of p.camiones) expect(k.ordenCarga).toEqual(k.orden.slice().reverse());
  });

  it('rutea una tienda NUEVA por ubicación y avisa que no tiene historial', () => {
    // 'D' no está en el historial: igual entra al ruteo, pero marcada.
    const p = planificarIncremental([U('A','P',600), U('D','P',600)], flota, GPS, CD, undefined,
      { A: H(1) }, 700, opts);
    expect(p.camiones.flatMap(k => k.orden)).toContain('D');
    expect(p.nuevas).toEqual(['D']);
    expect(p.avisos.join(' ')).toContain('sin historial');
  });

  it('la tienda nueva mantiene abierto su camión hasta el corte', () => {
    const p = planificarIncremental([U('D','P',600)], flota, GPS, CD, undefined, {}, 600 + O.silencioMin, opts);
    expect(p.camiones[0].estado).toBe('abierto');
  });

  it('avisa cuando una tienda cae en un camión de otra empresa', () => {
    const conEmpresa = [V('T1', 10, 20, { empresa: 'Ortiz' })];
    const u = [U('A','P',600)];
    const hist = { A: H(1, 2, { empresa: 'Luis Fica', confianzaEmpresa: 0.9 }) };
    const p = planificarIncremental(u, conEmpresa, GPS, CD, undefined, hist, 700, opts);
    expect(p.avisos.join(' ')).toContain('Luis Fica');
  });

  it('no avisa si la empresa histórica es débil', () => {
    const conEmpresa = [V('T1', 10, 20, { empresa: 'Ortiz' })];
    const hist = { A: H(1, 2, { empresa: 'Luis Fica', confianzaEmpresa: 0.2 }) };
    const p = planificarIncremental([U('A','P',600)], conEmpresa, GPS, CD, undefined, hist, 700, opts);
    expect(p.avisos.join(' ')).not.toContain('Luis Fica');
  });

  it('solo lista como carga las unidades realmente salidas', () => {
    const p = planificarIncremental([U('A','P',600)], flota, GPS, CD, undefined, { A: H(1, 8) }, 610, opts);
    expect(p.camiones[0].ts.reduce((s, t) => s + t.p, 0)).toBe(1);
  });

  it('es determinista ante distinto orden de llegada', () => {
    const u = [U('A','P',600), U('B','P',601), U('C','P',602)];
    const hist = { A: H(1), B: H(1), C: H(1) };
    const a = planificarIncremental(u, flota, GPS, CD, undefined, hist, 700, opts);
    const b = planificarIncremental(u.slice().reverse(), flota, GPS, CD, undefined, hist, 700, opts);
    expect(a.camiones.map(k => k.orden.join('>')).sort()).toEqual(b.camiones.map(k => k.orden.join('>')).sort());
  });
});

describe('rutasDelPlan', () => {
  it('devuelve Ruta[] con las mismas paradas del plan', () => {
    const p = planificarIncremental([U('A','P',600), U('B','P',600)], [V('T1')], GPS, CD, undefined,
      { A: { esperado: 1, techoPallets: 2 }, B: { esperado: 1, techoPallets: 2 } }, 700, { maxDiametroKm: 0, respetarVentanas: false });
    const rutas = rutasDelPlan(p, GPS, CD);
    expect(rutas.flatMap(r => r.ts.map(t => t.c)).sort()).toEqual(['A','B']);
    expect(rutas[0].v.p).toBe('T1');
  });
});
