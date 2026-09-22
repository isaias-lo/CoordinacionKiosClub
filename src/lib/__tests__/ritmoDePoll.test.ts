import { describe, it, expect } from 'vitest';
import { debeConsultar, TICK_MS, TICKS_CON_CANAL_SANO } from '../ritmoDePoll';

describe('con el canal caído, el respaldo de siempre', () => {
  it.each([1, 2, 3, 4, 5, 17])('tick %i consulta', (t) => {
    expect(debeConsultar(false, t)).toBe(true);
  });

  it('son 15 s entre consultas', () => {
    expect(TICK_MS).toBe(15_000);
  });
});

describe('con el canal sano, uno de cada cuatro', () => {
  it('el primer minuto: solo el cuarto tick', () => {
    expect([1, 2, 3, 4].map(t => debeConsultar(true, t))).toEqual([false, false, false, true]);
  });

  it('y sigue una vez por minuto', () => {
    expect([5, 6, 7, 8].map(t => debeConsultar(true, t))).toEqual([false, false, false, true]);
  });

  it('4 ticks × 15 s = un minuto de piso', () => {
    expect(TICKS_CON_CANAL_SANO * TICK_MS).toBe(60_000);
  });
});

describe('el bug que corrige: el canal mudo dejaba al equipo ciego para siempre', () => {
  it('antes NUNCA consultaba con el canal "sano"; ahora sí, aunque el canal no traiga nada', () => {
    // Una hora de ticks con el canal diciendo que todo bien.
    const consultas = Array.from({ length: 240 }, (_, i) => debeConsultar(true, i + 1)).filter(Boolean).length;
    expect(consultas).toBe(60);   // una por minuto — antes: cero
  });

  it('lo peor que puede pasar es enterarse un minuto tarde, no nunca', () => {
    const primeraConsulta = [1, 2, 3, 4, 5].findIndex(t => debeConsultar(true, t)) + 1;
    expect(primeraConsulta * TICK_MS).toBeLessThanOrEqual(60_000);
  });
});

describe('casos de borde', () => {
  it('cada=0 no divide por cero: consulta siempre', () => {
    expect(debeConsultar(true, 3, 0)).toBe(true);
  });

  it('tick 0 no consulta con canal sano', () => {
    expect(debeConsultar(true, 0)).toBe(false);
  });

  it('el ritmo se puede ajustar', () => {
    expect([1, 2].map(t => debeConsultar(true, t, 2))).toEqual([false, true]);
  });
});
