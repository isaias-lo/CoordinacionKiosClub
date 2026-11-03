import { describe, it, expect } from 'vitest';
import { horaChile, duracionMinutos, formatearDuracion } from '../horasPlanilla';

describe('horaChile: Odoo guarda UTC', () => {
  it('corre las tres horas en horario de verano', () => {
    // 27MCH Hogar del 03/11/2026: Odoo dice 11:33:29, en Chile empezó 08:33.
    expect(horaChile('2026-11-03 11:33:29')).toBe('08:33');
  });

  it('corre las cuatro horas en horario de invierno', () => {
    // En junio Chile está en UTC-4.
    expect(horaChile('2026-06-10 13:00:00')).toBe('09:00');
  });

  it('acepta el formato con T y con Z', () => {
    expect(horaChile('2026-11-03T11:33:29Z')).toBe('08:33');
  });

  it('sin dato devuelve cadena vacía, no una hora inventada', () => {
    expect(horaChile(null)).toBe('');
    expect(horaChile('')).toBe('');
    expect(horaChile('no es una fecha')).toBe('');
  });
});

describe('duracionMinutos', () => {
  it('resta las dos horas de Odoo', () => {
    expect(duracionMinutos('2026-11-03 11:33:29', '2026-11-03 13:59:58')).toBe(146);
  });

  it('sin hora de inicio no hay duración', () => {
    expect(duracionMinutos(null, '2026-11-03 13:59:58')).toBeNull();
  });

  it('sin hora de validación no hay duración', () => {
    expect(duracionMinutos('2026-11-03 11:33:29', null)).toBeNull();
  });

  it('una validación anterior al inicio no devuelve un negativo', () => {
    expect(duracionMinutos('2026-11-03 13:00:00', '2026-11-03 11:00:00')).toBeNull();
  });
});

describe('formatearDuracion', () => {
  it('bajo una hora, en minutos', () => {
    expect(formatearDuracion(20)).toBe('20 min');
    expect(formatearDuracion(0)).toBe('0 min');
  });

  it('desde una hora, en horas y minutos con dos dígitos', () => {
    expect(formatearDuracion(146)).toBe('2 h 26');
    expect(formatearDuracion(60)).toBe('1 h 00');
    expect(formatearDuracion(65)).toBe('1 h 05');
  });

  it('sin duración, una raya', () => {
    expect(formatearDuracion(null)).toBe('—');
  });
});
