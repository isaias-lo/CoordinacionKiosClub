import { describe, it, expect } from 'vitest';
import { formatFechaHistorial } from '../historial';

describe('formatFechaHistorial', () => {
  it('formatea sin correrse de día (el bug clásico de Date + timeZone Chile)', () => {
    // 2026-09-10 tiene que seguir leyéndose "10", nunca "09" — es el mismo bug documentado en
    // lib/fechaChile.ts para "qué día es hoy".
    expect(formatFechaHistorial('2026-09-10')).toBe('jue, 10-09');
  });

  it('funciona en el borde de año (31-dic → 01-ene no debe existir el corrimiento)', () => {
    expect(formatFechaHistorial('2026-01-01')).toBe('jue, 01-01');
  });

  it('devuelve la fecha original si el string no matchea YYYY-MM-DD', () => {
    expect(formatFechaHistorial('no-es-una-fecha')).toBe('no-es-una-fecha');
    expect(formatFechaHistorial('')).toBe('');
  });
});
