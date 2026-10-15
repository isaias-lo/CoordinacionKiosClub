import { describe, it, expect } from 'vitest';
import { reclamoRetrocede, mensajeClaim } from '../mensajeClaim';

describe('reclamoRetrocede: un reclamo nunca saca un pallet de una carga más nueva', () => {
  it('pestaña abierta desde ayer que escanea un pallet vivo de hoy: se rechaza', () => {
    expect(reclamoRetrocede('2026-10-15', '2026-10-14', true)).toBe(true);
  });

  it('pallet adelantado de un día anterior: se puede traer a hoy', () => {
    expect(reclamoRetrocede('2026-10-13', '2026-10-15', true)).toBe(false);
  });

  it('mismo día: no retrocede', () => {
    expect(reclamoRetrocede('2026-10-15', '2026-10-15', true)).toBe(false);
  });

  it('inactivo (absorbido o desactivado): no hay carga viva que proteger', () => {
    expect(reclamoRetrocede('2026-10-15', '2026-10-14', false)).toBe(false);
  });

  it('fecha rara o vacía: no bloquea', () => {
    expect(reclamoRetrocede(null, '2026-10-14', true)).toBe(false);
    expect(reclamoRetrocede('ayer', '2026-10-14', true)).toBe(false);
  });

  it('acepta la fecha con hora', () => {
    expect(reclamoRetrocede('2026-10-15T00:00:00', '2026-10-14', true)).toBe(true);
  });

  it('el mensaje dice que no se movió y qué hacer', () => {
    const m = mensajeClaim('de_dia_posterior', { ref: '2671' });
    expect(m).toContain('#2671');
    expect(m).toContain('No se movió');
  });
});
