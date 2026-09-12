import { describe, it, expect } from 'vitest';
import { avisoOdoo, motivoOdoo } from '../avisoOdoo';

describe('motivoOdoo', () => {
  it('distingue apagado a propósito de nunca configurado', () => {
    expect(motivoOdoo(true)).toBe('desactivado');
    expect(motivoOdoo(false)).toBe('sin-credenciales');
  });
});

describe('avisoOdoo', () => {
  it('dice qué se pierde en esa pantalla', () => {
    const a = avisoOdoo('desactivado', 'no se cargan las operaciones del día');
    expect(a.detalle).toContain('no se cargan las operaciones del día');
  });

  it('dice quién lo destraba, en las dos situaciones', () => {
    expect(avisoOdoo('desactivado', 'x').detalle).toContain('administrador');
    expect(avisoOdoo('sin-credenciales', 'x').detalle).toContain('administrador');
  });

  it('el título distingue las dos situaciones', () => {
    expect(avisoOdoo('desactivado', 'x').titulo).toBe('Odoo está desactivado');
    expect(avisoOdoo('sin-credenciales', 'x').titulo).toBe('Odoo no está configurado');
  });

  it('no habla como si algo se hubiera roto', () => {
    for (const m of ['desactivado', 'sin-credenciales'] as const) {
      const { titulo, detalle } = avisoOdoo(m, 'no se pueden cargar las estadísticas');
      expect(`${titulo} ${detalle}`.toLowerCase()).not.toMatch(/error|falla|fallo|problema|!/);
    }
  });

  it('la misma pantalla se cuenta igual, cambie el motivo', () => {
    const a = avisoOdoo('desactivado', 'no se pueden cargar las estadísticas');
    const b = avisoOdoo('sin-credenciales', 'no se pueden cargar las estadísticas');
    expect(a.detalle).toContain('no se pueden cargar las estadísticas');
    expect(b.detalle).toContain('no se pueden cargar las estadísticas');
  });
});
