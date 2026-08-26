import { describe, it, expect } from 'vitest';
import { construirHistorialTiendas, diaSemana, diasAtras, type FilaPicking, type FilaDespacho } from '../historialTiendas';

describe('helpers de fecha', () => {
  it('diaSemana: días a 7 de distancia caen en el mismo día de semana; a 1, en distinto', () => {
    expect(diaSemana('2026-08-24')).toBe(diaSemana('2026-08-17'));
    expect(diaSemana('2026-08-24')).not.toBe(diaSemana('2026-08-25'));
  });
  it('diasAtras cuenta días enteros hacia atrás', () => {
    expect(diasAtras('2026-08-17', '2026-08-24')).toBe(7);
    expect(diasAtras('2026-08-24', '2026-08-24')).toBe(0);
  });
});

const P = (store_cod: string, tipo: string, date: string): FilaPicking => ({ store_cod, tipo, date });
const D = (cod: string, transporte: string, fecha: string): FilaDespacho => ({ cod, transporte, fecha });
const HOY = '2026-08-24'; // el mismo día de semana que 08-17 y 08-10

describe('construirHistorialTiendas', () => {
  it('volumen: mediana de unidades/día del MISMO día de semana; ignora otro día de semana y el día en curso', () => {
    const picking: FilaPicking[] = [
      // 08-17 (mismo DOW, pasado): 3 unidades, 2 de piso (P,P) + 1 bulto
      P('A', 'P', '2026-08-17'), P('A', 'P', '2026-08-17'), P('A', 'B', '2026-08-17'),
      // 08-10 (mismo DOW, pasado): 3 unidades, 1 de piso (P) + bulto + choc
      P('A', 'P', '2026-08-10'), P('A', 'B', '2026-08-10'), P('A', 'CH', '2026-08-10'),
      // 08-18 (otro DOW): se ignora
      P('A', 'P', '2026-08-18'), P('A', 'P', '2026-08-18'),
      // 08-24 (HOY, en curso): se ignora (>= hoy)
      P('A', 'P', '2026-08-24'), P('A', 'P', '2026-08-24'), P('A', 'P', '2026-08-24'),
    ];
    const r = construirHistorialTiendas(picking, [], HOY);
    expect(r.A.esperado).toBe(3);          // mediana de [3, 3]
    expect(r.A.sinHistorial).toBe(false);
    expect(r.A.techoPallets).toBeGreaterThanOrEqual(2); // promedio+1σ sobre pallets+contenedores
  });

  it('un contenedor cuenta como piso (para techoPallets), un bulto/chocolate no', () => {
    // Dos días con 1 contenedor cada uno → pallets/piso por día = [1,1] → techo ≈ 2.
    const picking: FilaPicking[] = [
      P('CON', 'C', '2026-08-17'), P('CON', 'B', '2026-08-17'),
      P('CON', 'C', '2026-08-10'), P('CON', 'CH', '2026-08-10'),
    ];
    const r = construirHistorialTiendas(picking, [], HOY);
    expect(r.CON.esperado).toBe(2);           // mediana de [2,2] unidades
    expect(r.CON.techoPallets).toBeGreaterThanOrEqual(1);
    expect(r.CON.sinHistorial).toBe(false);
  });

  it('empresa: la transportista reciente pesa más (empresaHabitual pondera recencia)', () => {
    const despachos: FilaDespacho[] = [
      D('A', 'Kios Club', '2026-08-17'),  // reciente (7 días)
      D('A', 'Falabella', '2026-07-15'),  // vieja (40 días)
      D('A', 'Falabella', '2026-07-08'),  // vieja (47 días)
    ];
    const r = construirHistorialTiendas([], despachos, HOY);
    expect(r.A.empresa).toBe('Kios Club'); // gana la reciente (semivida 21d) pese a menos apariciones
    expect(r.A.confianzaEmpresa).toBeGreaterThan(0);
  });

  it('tienda con despachos pero sin volumen histórico → sinHistorial, con empresa', () => {
    const r = construirHistorialTiendas([], [D('B', 'Luis Fica', '2026-08-17')], HOY);
    expect(r.B.sinHistorial).toBe(true);
    expect(r.B.esperado).toBe(0);
    expect(r.B.empresa).toBe('Luis Fica');
  });

  it('ignora despachos del día en curso y sin transporte', () => {
    const r = construirHistorialTiendas([], [
      D('B', 'Kios Club', '2026-08-24'),        // hoy → ignorado
      { cod: 'B', fecha: '2026-08-17', transporte: '' }, // sin transporte → ignorado
    ], HOY);
    expect(r.B?.empresa).toBeUndefined();
  });

  it('sin filas → objeto vacío', () => {
    expect(construirHistorialTiendas([], [], HOY)).toEqual({});
  });
});
