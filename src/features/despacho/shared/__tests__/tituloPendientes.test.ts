import { describe, it, expect } from 'vitest';
import { tituloPendientes } from '../tituloPendientes';

describe('tituloPendientes', () => {
  it('uno solo', () => {
    expect(tituloPendientes(['15 oct 2026'])).toBe('Despacho sin registrar · 15 oct 2026');
  });
  it('varios: cuántos y cuáles', () => {
    expect(tituloPendientes(['15 oct 2026', '9 oct 2026'])).toBe('2 despachos sin registrar · 15 oct 2026 y 9 oct 2026');
    expect(tituloPendientes(['3', '2', '1'])).toBe('3 despachos sin registrar · 3, 2 y 1');
  });
  it('ninguno', () => {
    expect(tituloPendientes([])).toBe('');
  });
});
