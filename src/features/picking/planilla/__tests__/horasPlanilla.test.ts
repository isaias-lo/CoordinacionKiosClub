import { describe, it, expect } from 'vitest';
import { horaChile, duracionMinutos, formatearDuracion, relojDe } from '../horasPlanilla';

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

describe('horaChile: el cambio de horario', () => {
  it('cruza el salto de septiembre sin restar un offset fijo', () => {
    // Chile adelanta el 06/09/2026 a las 04:00 UTC. Medido: 03:30 UTC es 23:30 del día anterior
    // (UTC-4) y 05:30 UTC ya es 02:30 (UTC-3). Un offset fijo erraría uno de los dos.
    expect(horaChile('2026-09-06 03:30:00')).toBe('23:30');
    expect(horaChile('2026-09-06 05:30:00')).toBe('02:30');
  });

  it('acepta el `false` con el que Odoo dice «sin fecha»', () => {
    // `date_done` de un movimiento sin validar llega como false, no como null.
    expect(horaChile(false)).toBe('');
    expect(duracionMinutos('2026-11-03 11:00:00', false)).toBeNull();
  });
});

describe('duracionMinutos: lo que un firmante puede verificar a mano', () => {
  it('trunca los segundos, así la resta coincide con las horas impresas', () => {
    // La hoja muestra 08:33 y 10:59: restar a mano da 146. Con los segundos crudos daba 145.
    expect(horaChile('2026-11-03 11:33:50')).toBe('08:33');
    expect(horaChile('2026-11-03 13:59:10')).toBe('10:59');
    expect(duracionMinutos('2026-11-03 11:33:50', '2026-11-03 13:59:10')).toBe(146);
  });

  it('mide tiempo real aunque la hora de pared se repita', () => {
    // Medido: el 05/04/2026 las 02:30 y las 03:30 UTC muestran las dos «23:30», porque Chile
    // vuelve a UTC-4. Restar lo impreso daría 0; pasaron 60 minutos.
    expect(horaChile('2026-04-05 02:30:00')).toBe('23:30');
    expect(horaChile('2026-04-05 03:30:00')).toBe('23:30');
    expect(duracionMinutos('2026-04-05 02:30:00', '2026-04-05 03:30:00')).toBe(60);
  });
});

describe('relojDe: el contador de la celda', () => {
  const AHORA = new Date('2026-11-06T15:30:00Z');

  it('validado: se detiene y muestra lo que tardó', () => {
    const r = relojDe('2026-11-06 11:00:00', '2026-11-06 13:26:00', AHORA);
    expect(r.estado).toBe('listo');
    expect(r.minutos).toBe(146);
    expect(r.texto).toBe('2 h 26');
  });

  it('asignado y sin validar: corre contra el reloj', () => {
    const r = relojDe('2026-11-06 14:48:00', null, AHORA);
    expect(r.estado).toBe('corre');
    expect(r.minutos).toBe(42);
    expect(r.texto).toBe('42 min');
  });

  it('el que corre avanza con el reloj; el detenido no', () => {
    // Es la diferencia que se tiene que ver en pantalla: uno late, el otro quedó fijo.
    const masTarde = new Date('2026-11-06T16:30:00Z');
    expect(relojDe('2026-11-06 14:48:00', null, masTarde).minutos).toBe(102);
    expect(relojDe('2026-11-06 11:00:00', '2026-11-06 13:26:00', masTarde).minutos).toBe(146);
  });

  it('sin hora de asignación no inventa un cero', () => {
    // Un movimiento que todavía no se le dio a nadie no lleva cero minutos: no lleva nada.
    const r = relojDe(null, null, AHORA);
    expect(r.estado).toBe('sin-datos');
    expect(r.minutos).toBeNull();
    expect(r.texto).toBe('—');
  });

  it('validado pero sin hora de asignación tampoco se puede medir', () => {
    expect(relojDe(null, '2026-11-06 13:26:00', AHORA).estado).toBe('sin-datos');
  });

  it('entiende el `false` que manda Odoo', () => {
    expect(relojDe('2026-11-06 14:48:00', false, AHORA).estado).toBe('corre');
    expect(relojDe(false, false, AHORA).estado).toBe('sin-datos');
  });

  it('una asignación en el futuro no da minutos negativos', () => {
    // Pasa con un desfase de reloj entre Odoo y el navegador. Un «−3 min» en pantalla se lee
    // como que la planilla está rota.
    const r = relojDe('2026-11-06 18:00:00', null, AHORA);
    expect(r.estado).toBe('sin-datos');
    expect(r.minutos).toBeNull();
  });

  it('recién asignado muestra cero, que sí es un dato', () => {
    expect(relojDe('2026-11-06 15:30:00', null, AHORA).texto).toBe('0 min');
  });
});
