import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// El módulo importa el cliente supabase al cargar; lo mockeamos para no inicializarlo en tests.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ delete: () => ({ eq: () => ({ then: () => {} }) }) }) },
}));

import { marcarRecienBorrado, fueRecienBorrado } from '../eliminarSlotPicking';

describe('registro "recién borrado" (RC-3: guard anti-revive)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un id marcado queda "recién borrado" y expira solo tras el TTL', () => {
    expect(fueRecienBorrado(101)).toBe(false);
    marcarRecienBorrado(101);
    expect(fueRecienBorrado(101)).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(fueRecienBorrado(101)).toBe(true);  // sigue dentro de la ventana de propagación
    vi.advanceTimersByTime(2);
    expect(fueRecienBorrado(101)).toBe(false); // ya expiró (TTL 5000 ms)
  });

  it('marca ids independientes', () => {
    marcarRecienBorrado(1);
    marcarRecienBorrado(2);
    expect(fueRecienBorrado(1)).toBe(true);
    expect(fueRecienBorrado(2)).toBe(true);
    expect(fueRecienBorrado(3)).toBe(false);
    vi.advanceTimersByTime(5001);
    expect(fueRecienBorrado(1)).toBe(false);
    expect(fueRecienBorrado(2)).toBe(false);
  });
});
