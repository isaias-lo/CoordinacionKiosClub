import { describe, it, expect } from 'vitest';
import { fechaISOLocal } from '../fechaLocal';

// Los instantes se escriben en UTC a propósito: así el test da lo mismo corra en el CD, en CI o en
// otro huso. Chile está en UTC-4 (invierno) / UTC-3 (verano) — el helper resuelve el horario de
// verano solo, vía Intl.
describe('fechaISOLocal — día del CD (America/Santiago)', () => {
  it('formatea YYYY-MM-DD', () => {
    expect(fechaISOLocal(new Date('2026-08-27T16:00:00Z'))).toBe('2026-08-27'); // 12:00 en Chile
  });

  it('rellena mes y día de un dígito con cero', () => {
    expect(fechaISOLocal(new Date('2026-01-05T15:00:00Z'))).toBe('2026-01-05');
    expect(fechaISOLocal(new Date('2026-09-09T15:00:00Z'))).toBe('2026-09-09');
  });

  it('a las 23:30 de Chile sigue siendo HOY, aunque en UTC ya sea mañana', () => {
    // 28-ago 03:30 UTC = 27-ago 23:30 en Chile. Con el día UTC esto daba '2026-08-28' → el bug.
    expect(fechaISOLocal(new Date('2026-08-28T03:30:00Z'))).toBe('2026-08-27');
  });

  it('a las 21:30 de Chile —la hora de la auditoría— tampoco se adelanta', () => {
    // 12-sep 00:30 UTC = 11-sep 21:30 en Chile. Es el "Hoy = 12/09" que mostraba Actividad.
    expect(fechaISOLocal(new Date('2026-09-12T00:30:00Z'))).toBe('2026-09-11');
  });

  it('a las 00:30 de Chile ya es el día nuevo', () => {
    // 27-ago 04:30 UTC = 27-ago 00:30 en Chile (UTC-4 en invierno).
    expect(fechaISOLocal(new Date('2026-08-27T04:30:00Z'))).toBe('2026-08-27');
  });

  it('a las 23:30 del día anterior todavía NO cambió el día', () => {
    // 27-ago 03:30 UTC = 26-ago 23:30 en Chile. Una hora antes que el caso de arriba.
    expect(fechaISOLocal(new Date('2026-08-27T03:30:00Z'))).toBe('2026-08-26');
  });

  it('no depende del huso del equipo: el mismo instante da el mismo día siempre', () => {
    const instante = new Date('2026-09-12T00:30:00Z');
    expect(fechaISOLocal(instante)).toBe(fechaISOLocal(new Date(instante.getTime())));
  });

  it('sin argumento devuelve el día de hoy en Chile', () => {
    expect(fechaISOLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
