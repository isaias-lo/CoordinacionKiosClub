import { describe, it, expect } from 'vitest';
import { diaDeSalida, filtroDiaSalida, historialPorSalida } from '../diaSalida';

describe('diaDeSalida', () => {
  it('usa fecha_salida cuando existe', () => {
    expect(diaDeSalida({ fecha: '2026-10-29', fecha_salida: '2026-10-30' })).toBe('2026-10-30');
  });
  it('cae en el armado para filas viejas sin fecha_salida', () => {
    expect(diaDeSalida({ fecha: '2026-09-10', fecha_salida: null })).toBe('2026-09-10');
    expect(diaDeSalida({ fecha: '2026-09-10' })).toBe('2026-09-10');
  });
});

describe('filtroDiaSalida', () => {
  it('arma el or de PostgREST con salida o, sin salida, armado', () => {
    expect(filtroDiaSalida('2026-10-30'))
      .toBe('fecha_salida.eq.2026-10-30,and(fecha_salida.is.null,fecha.eq.2026-10-30)');
  });
  it('rechaza cualquier cosa que no sea YYYY-MM-DD', () => {
    expect(filtroDiaSalida('')).toBeNull();
    expect(filtroDiaSalida('30/10/2026')).toBeNull();
    expect(filtroDiaSalida('2026-10-30,estado.eq.x')).toBeNull();
  });
});

describe('historialPorSalida', () => {
  const t = (...e: string[]) => e.map(estado_entrega => ({ estado_entrega }));

  it('agrupa por día de salida, no de armado (caso real: armado 29, sale 30)', () => {
    const r = historialPorSalida([
      { fecha: '2026-10-28', fecha_salida: '2026-10-29', ruta_tiendas: t('entregado', 'pendiente') },
      { fecha: '2026-10-29', fecha_salida: '2026-10-30', ruta_tiendas: t('entregado') },
    ], '2026-10-16', '2026-10-29');
    expect(r).toEqual([{ fecha: '2026-10-29', rutas: 1, paradas: 2, entregadas: 1 }]);
  });

  it('lo armado el viernes cuenta para el lunes en que salió', () => {
    const r = historialPorSalida([
      { fecha: '2026-10-23', fecha_salida: '2026-10-26', ruta_tiendas: t('entregado') },
      { fecha: '2026-10-26', fecha_salida: '2026-10-26', ruta_tiendas: t('no_entregado') },
    ], '2026-10-20', '2026-10-29');
    expect(r).toEqual([{ fecha: '2026-10-26', rutas: 2, paradas: 2, entregadas: 1 }]);
  });

  it('deja fuera lo que sale antes de desde y ordena del más reciente al más viejo', () => {
    const r = historialPorSalida([
      { fecha: '2026-10-10', fecha_salida: '2026-10-11', ruta_tiendas: [] },
      { fecha: '2026-10-20', fecha_salida: null, ruta_tiendas: [] },
      { fecha: '2026-10-21', fecha_salida: '2026-10-22' },
    ], '2026-10-16', '2026-10-29');
    expect(r.map(d => d.fecha)).toEqual(['2026-10-22', '2026-10-20']);
  });
});
