import { describe, it, expect } from 'vitest';
import { isFetchedToday } from '../picking-utils';

// Guardia que evita restaurar el semáforo (opsMap) del día anterior con la pestaña abierta
// cruzando la medianoche. Compara por día LOCAL.
describe('isFetchedToday', () => {
  const now = new Date('2026-07-28T09:00:00'); // "hoy" local, mañana

  it('mismo día local → true', () => {
    expect(isFetchedToday(new Date('2026-07-28T01:30:00').toISOString(), now)).toBe(true);
    expect(isFetchedToday(new Date('2026-07-28T23:30:00').toISOString(), now)).toBe(true);
  });

  it('día anterior → false (el bug: semáforo de ayer)', () => {
    expect(isFetchedToday(new Date('2026-07-27T23:00:00').toISOString(), now)).toBe(false);
  });

  it('sin fecha / inválida → false (falla del lado seguro: no restaura verde viejo)', () => {
    expect(isFetchedToday(undefined, now)).toBe(false);
    expect(isFetchedToday('', now)).toBe(false);
    expect(isFetchedToday('no-es-fecha', now)).toBe(false);
  });
});
