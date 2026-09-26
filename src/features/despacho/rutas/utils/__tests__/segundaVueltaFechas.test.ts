import { describe, it, expect } from 'vitest';
import { fechasBacklogV2, poolV2ParaFecha, conteoPorFecha, type PendienteOrigen, codsDeCierreV2 } from '../segundaVueltaFechas';

const norm = (s: string) => s.trim().toUpperCase();
const grpOf = () => 'rm';

// 30PHU pendiente en DOS fechas + otras tiendas por día
const pend: PendienteOrigen[] = [
  { c: '30PHU', p: 2, b: 3, ch: 0, fechaOrigen: '2026-08-04' },
  { c: '02SCL', p: 1, b: 0, ch: 0, fechaOrigen: '2026-08-04' },
  { c: '30PHU', p: 4, b: 1, ch: 0, fechaOrigen: '2026-08-06' },
  { c: '34SMB', p: 2, b: 0, ch: 0, fechaOrigen: '2026-08-06' },
];

describe('fechasBacklogV2', () => {
  it('devuelve fechas distintas, ascendente', () => {
    expect(fechasBacklogV2(pend)).toEqual(['2026-08-04', '2026-08-06']);
  });
  it('ignora vacías y deduplica', () => {
    expect(fechasBacklogV2([{ fechaOrigen: '' }, { fechaOrigen: '2026-08-05' }, { fechaOrigen: '2026-08-05' }]))
      .toEqual(['2026-08-05']);
  });
});

describe('poolV2ParaFecha', () => {
  it('NO suma entre fechas: 30PHU del 04 sale con su propio conteo', () => {
    const p04 = poolV2ParaFecha(pend, '2026-08-04', norm, grpOf);
    expect(p04['30PHU']).toEqual({ on: true, p: 2, b: 3, c: 0, ch: 0, g: 'rm' });
    expect(p04['02SCL']).toEqual({ on: true, p: 1, b: 0, c: 0, ch: 0, g: 'rm' });
    expect(Object.keys(p04).sort()).toEqual(['02SCL', '30PHU']); // solo tiendas del 04
  });
  it('30PHU del 06 sale por separado (4P-1B), no mezclado con el 04', () => {
    const p06 = poolV2ParaFecha(pend, '2026-08-06', norm, grpOf);
    expect(p06['30PHU']).toEqual({ on: true, p: 4, b: 1, c: 0, ch: 0, g: 'rm' });
    expect(Object.keys(p06).sort()).toEqual(['30PHU', '34SMB']);
  });
  it('fecha sin pendientes → pool vacío', () => {
    expect(poolV2ParaFecha(pend, '2026-08-05', norm, grpOf)).toEqual({});
  });
});

describe('conteoPorFecha', () => {
  it('cuenta tiendas por fecha', () => {
    expect(conteoPorFecha(pend)).toEqual({ '2026-08-04': 2, '2026-08-06': 2 });
  });
});

describe('codsDeCierreV2 — qué sale de las pendientes al cerrar un camión', () => {
  const pend = [
    { c: '23PEÑ', p: 2, b: 0, ch: 0, fechaOrigen: '2026-09-24' },
    { c: '04PDG', p: 1, b: 3, ch: 0, fechaOrigen: '2026-09-24' },
    { c: '09LEO', p: 1, b: 0, ch: 0, fechaOrigen: '2026-09-25' }, // otra fecha
  ];

  it('devuelve el código TAL COMO ESTÁ GUARDADO, no el normalizado', () => {
    // El que de verdad importa: norm('23PEÑ') es '23PEN', y `shared_session_state` guarda '23PEÑ'.
    // Devolver el normalizado dejaba la tienda figurando como pendiente después de despacharla.
    const cods = codsDeCierreV2(pend, '2026-09-24', [{ c: '23PEN' }]);
    expect([...cods]).toEqual(['23PEÑ']);
  });

  it('compara normalizando, así que casa igual con acentos o sin ellos', () => {
    expect([...codsDeCierreV2(pend, '2026-09-24', [{ c: '23peñ' }])]).toEqual(['23PEÑ']);
  });

  it('no toca las pendientes de OTRA fecha de origen aunque sea la misma tienda', () => {
    const mismaTienda = [...pend, { c: '04PDG', p: 1, b: 0, ch: 0, fechaOrigen: '2026-09-25' }];
    expect([...codsDeCierreV2(mismaTienda, '2026-09-24', [{ c: '04PDG' }])]).toEqual(['04PDG']);
  });

  it('la unión de dos camiones del lote es la suma de los dos', () => {
    // Es lo que el cierre en masa escribe de una sola vez: con una escritura por camión, cada una
    // leía la misma lista previa, quitaba solo lo suyo y ganaba la última.
    const a = codsDeCierreV2(pend, '2026-09-24', [{ c: '23PEN' }]);
    const b = codsDeCierreV2(pend, '2026-09-24', [{ c: '04PDG' }]);
    expect([...new Set([...a, ...b])].sort()).toEqual(['04PDG', '23PEÑ']);
  });

  it('un camión con tiendas que no están pendientes no saca nada', () => {
    expect(codsDeCierreV2(pend, '2026-09-24', [{ c: '99XXX' }]).size).toBe(0);
    expect(codsDeCierreV2(pend, '2026-09-26', [{ c: '04PDG' }]).size).toBe(0);
  });
});
