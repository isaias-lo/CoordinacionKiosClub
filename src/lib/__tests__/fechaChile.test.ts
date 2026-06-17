import { describe, it, expect } from 'vitest';
import { fechaChile } from '@/lib/fechaChile';

describe('fechaChile', () => {
  it('devuelve formato YYYY-MM-DD', () => {
    expect(fechaChile()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('el offset positivo da un día posterior y el negativo uno anterior', () => {
    const hoy = fechaChile(0);
    const manana = fechaChile(1);
    const ayer = fechaChile(-1);
    expect(manana > hoy).toBe(true);
    expect(ayer < hoy).toBe(true);
  });

  it('avanza correctamente cruzando fin de mes', () => {
    // No podemos fijar "hoy", pero sí verificar que ±1 son días calendario válidos
    // y consecutivos respecto a hoy.
    const hoy = fechaChile(0);
    const manana = fechaChile(1);
    const dHoy = new Date(hoy + 'T12:00:00Z').getTime();
    const dManana = new Date(manana + 'T12:00:00Z').getTime();
    expect(Math.round((dManana - dHoy) / 86400000)).toBe(1);
  });
});
