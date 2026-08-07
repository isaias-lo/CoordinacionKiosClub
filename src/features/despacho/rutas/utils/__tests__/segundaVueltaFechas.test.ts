import { describe, it, expect } from 'vitest';
import { fechasBacklogV2, poolV2ParaFecha, conteoPorFecha, type PendienteOrigen } from '../segundaVueltaFechas';

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
