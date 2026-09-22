import { describe, it, expect } from 'vitest';
import { esperaDePush, DEBOUNCE_PUSH_MS } from '../esperaDePush';

const T = 1_000_000;   // "ahora" arbitrario

describe('el primer cambio arranca la cuenta', () => {
  it('sin nada pendiente espera el debounce completo', () => {
    expect(esperaDePush(0, T)).toEqual({ espera: 2500, vencimiento: T + 2500 });
  });

  it('el vencimiento queda fijado desde ese primer cambio', () => {
    const { vencimiento } = esperaDePush(0, T);
    expect(vencimiento).toBe(T + DEBOUNCE_PUSH_MS);
  });
});

describe('los cambios siguientes NO reinician la cuenta', () => {
  it('a mitad de camino solo queda lo que falta', () => {
    const { vencimiento } = esperaDePush(0, T);
    expect(esperaDePush(vencimiento, T + 1000)).toEqual({ espera: 1500, vencimiento });
  });

  it('el vencimiento no se corre, por muchos cambios que entren', () => {
    const { vencimiento } = esperaDePush(0, T);
    let v = vencimiento;
    for (const t of [T + 200, T + 900, T + 1800, T + 2400]) v = esperaDePush(v, t).vencimiento;
    expect(v).toBe(vencimiento);
  });

  it('es la diferencia con un debounce clásico: con 5 personas empujando, el push propio sale igual', () => {
    // Un cambio remoto cada 400 ms durante 4 segundos. Con debounce clásico nunca saldría.
    const { vencimiento } = esperaDePush(0, T);
    let v = vencimiento, ultimaEspera = Infinity;
    for (let t = T; t <= T + 4000; t += 400) {
      const r = esperaDePush(v, t);
      v = r.vencimiento; ultimaEspera = r.espera;
    }
    expect(ultimaEspera).toBe(0);            // vencido: se empuja ya
  });
});

describe('un vencimiento ya pasado significa "empuja ya"', () => {
  it('no devuelve negativos', () => {
    expect(esperaDePush(T, T + 9999).espera).toBe(0);
  });
});

describe('nunca espera más que el máximo', () => {
  it('un vencimiento absurdamente lejano se acota', () => {
    expect(esperaDePush(T + 999_999, T).espera).toBe(DEBOUNCE_PUSH_MS);
  });

  it('el máximo se puede ajustar', () => {
    expect(esperaDePush(0, T, 800)).toEqual({ espera: 800, vencimiento: T + 800 });
  });
});
