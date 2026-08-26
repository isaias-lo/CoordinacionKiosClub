import { describe, it, expect } from 'vitest';
import { construirHistorialTiendas, diaSemana, diasAtras, normalizarFecha, type FilaPicking, type FilaDespacho } from '../historialTiendas';

// En la base conviven dos formatos: `picking_pallets.date` es ISO, pero `despacho_rm.fecha` y
// `despacho_regiones.fecha` son DD/MM/YYYY en el 100% de sus 5.662 filas. Estos tests usan el
// formato REAL de cada tabla — antes solo probaban ISO y por eso el bug pasó de largo.
describe('normalizarFecha', () => {
  it('deja ISO como está', () => {
    expect(normalizarFecha('2026-08-24')).toBe('2026-08-24');
  });
  it('convierte el DD/MM/YYYY de despacho_rm a ISO', () => {
    expect(normalizarFecha('13/05/2026')).toBe('2026-05-13');
    expect(normalizarFecha('30/05/2026')).toBe('2026-05-30');
  });
  it('rellena con cero los días y meses de un dígito', () => {
    expect(normalizarFecha('5/6/2026')).toBe('2026-06-05');
    expect(normalizarFecha('2026-8-4')).toBe('2026-08-04');
  });
  it('tolera basura devolviendo vacío en vez de una fecha inválida', () => {
    for (const x of ['', '   ', 'ayer', '13-05-2026', '2026/08/24', null, undefined]) {
      expect(normalizarFecha(x as string)).toBe('');
    }
  });
  it('el resultado ordena cronológicamente como string (que es como se filtra)', () => {
    expect(normalizarFecha('30/05/2026') < normalizarFecha('01/06/2026')).toBe(true);
    // el bug original: como string crudo, '30/05/2026' > '2026-08-26'
    expect('30/05/2026' > '2026-08-26').toBe(true);
    expect(normalizarFecha('30/05/2026') > '2026-08-26').toBe(false);
  });
});

describe('helpers de fecha', () => {
  it('diaSemana: días a 7 de distancia caen en el mismo día de semana; a 1, en distinto', () => {
    expect(diaSemana('2026-08-24')).toBe(diaSemana('2026-08-17'));
    expect(diaSemana('2026-08-24')).not.toBe(diaSemana('2026-08-25'));
  });
  it('diaSemana entiende DD/MM/YYYY igual que ISO', () => {
    expect(diaSemana('24/08/2026')).toBe(diaSemana('2026-08-24'));
  });
  it('diasAtras cuenta días enteros hacia atrás', () => {
    expect(diasAtras('2026-08-17', '2026-08-24')).toBe(7);
    expect(diasAtras('2026-08-24', '2026-08-24')).toBe(0);
  });
  it('diasAtras con DD/MM/YYYY da el mismo número, no NaN', () => {
    expect(diasAtras('17/08/2026', '2026-08-24')).toBe(7);
    expect(diasAtras('13/05/2026', '2026-08-24')).toBe(103);
  });
  it('con fecha irreconocible devuelve NaN para que el llamador la descarte', () => {
    expect(diasAtras('ayer', '2026-08-24')).toBeNaN();
    expect(diaSemana('ayer')).toBeNaN();
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


// ── Regresión del bug de formato de fecha (PR #377) ──────────────────────────────
describe('regresión: despachos en DD/MM/YYYY', () => {
  const HOY_R = '2026-08-24';

  it('deriva la empresa desde fechas DD/MM/YYYY con confianza numérica, no NaN', () => {
    const h = construirHistorialTiendas([], [
      D('A', 'Luis Fica', '17/08/2026'),
      D('A', 'Luis Fica', '10/08/2026'),
      D('A', 'Ortiz',     '13/05/2026'),
    ], HOY_R);
    expect(h.A.empresa).toBe('Luis Fica');
    expect(Number.isFinite(h.A.confianzaEmpresa)).toBe(true);
    expect(h.A.confianzaEmpresa).toBeGreaterThan(0.6);
  });

  it('NO descarta los despachos con día 26 al 31 (el filtro comparaba strings crudos)', () => {
    // '30/07/2026' > '2026-08-24' como string → antes se perdía en silencio.
    const h = construirHistorialTiendas([], [
      D('A', 'Ortiz', '30/07/2026'),
      D('A', 'Ortiz', '26/07/2026'),
      D('A', 'Ortiz', '31/07/2026'),
    ], HOY_R);
    expect(h.A).toBeDefined();
    expect(h.A.empresa).toBe('Ortiz');
    expect(h.A.confianzaEmpresa).toBe(1);
  });

  it('lo reciente sigue pesando más que lo viejo, también en DD/MM/YYYY', () => {
    const h = construirHistorialTiendas([], [
      D('A', 'Falabella', '01/06/2026'), D('A', 'Falabella', '03/06/2026'),
      D('A', 'Falabella', '05/06/2026'), D('A', 'Falabella', '07/06/2026'),
      D('A', 'Luis Fica', '22/08/2026'), D('A', 'Luis Fica', '23/08/2026'),
    ], HOY_R);
    expect(h.A.empresa).toBe('Luis Fica');
  });

  it('sigue ignorando los despachos de hoy y del futuro', () => {
    const h = construirHistorialTiendas([], [
      D('A', 'Ortiz', '24/08/2026'),   // hoy
      D('A', 'Ortiz', '25/08/2026'),   // futuro
    ], HOY_R);
    expect(h.A).toBeUndefined();
  });

  it('descarta la fila con fecha irreconocible sin envenenar el resto', () => {
    const h = construirHistorialTiendas([], [
      D('A', 'Ortiz', 'sin fecha'),
      D('A', 'Ortiz', '17/08/2026'),
    ], HOY_R);
    expect(h.A.confianzaEmpresa).toBe(1);
  });

  it('acepta picking en DD/MM/YYYY aunque hoy llegue en ISO', () => {
    const h = construirHistorialTiendas([
      P('A', 'P', '17/08/2026'), P('A', 'P', '17/08/2026'),
      P('A', 'P', '10/08/2026'), P('A', 'P', '10/08/2026'),
    ], [], HOY_R);
    expect(h.A.esperado).toBe(2);
    expect(h.A.sinHistorial).toBe(false);
  });

  it('funciona igual si `hoy` viene en DD/MM/YYYY', () => {
    const h = construirHistorialTiendas([], [D('A', 'Ortiz', '17/08/2026')], '24/08/2026');
    expect(h.A.empresa).toBe('Ortiz');
    expect(h.A.confianzaEmpresa).toBe(1);
  });
});
