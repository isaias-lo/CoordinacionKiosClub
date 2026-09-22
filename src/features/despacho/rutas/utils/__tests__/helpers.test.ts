import { describe, it, expect } from 'vitest';
import { fechaTrasMedianoche } from '../helpers';

describe('fechaTrasMedianoche', () => {
  it('no toca fecha si el reloj real no cruzó medianoche', () => {
    expect(fechaTrasMedianoche('2026-09-21', '2026-09-21', '2026-09-21')).toBe('2026-09-21');
  });

  it('adelanta fecha cuando seguía apuntando al "hoy" viejo (caso VKDZ85)', () => {
    expect(fechaTrasMedianoche('2026-09-21', '2026-09-21', '2026-09-22')).toBe('2026-09-22');
  });

  it('NO toca un día pasado abierto a mano, aunque el reloj real haya avanzado', () => {
    // El aviso de "días sin registrar" hizo setFecha('2026-09-15') mientras hoy era '2026-09-21'.
    expect(fechaTrasMedianoche('2026-09-15', '2026-09-21', '2026-09-22')).toBe('2026-09-15');
  });

  it('si cruzan varias medianoches de una (pestaña dormida días), igual adelanta al hoy real', () => {
    expect(fechaTrasMedianoche('2026-09-19', '2026-09-19', '2026-09-22')).toBe('2026-09-22');
  });
});
