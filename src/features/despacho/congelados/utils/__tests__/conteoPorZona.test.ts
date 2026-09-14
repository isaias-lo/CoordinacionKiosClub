import { describe, it, expect } from 'vitest';
import { conteoDeZona, badgeZona, CONTEO_VACIO } from '../conteoPorZona';

// El día real del 11/09/2026 en RM: 22LGN 13 cajas, 16PQA 4, 02SCL 2.
const RM = ['01TPS', '22LGN', '13PIE', '16PQA', '02SCL'];
const CAJAS = { '22LGN': { total: 13 }, '16PQA': { total: 4 }, '02SCL': { total: 2 } };

describe('conteoDeZona', () => {
  it('cuenta tiendas con carga, cajas y pendientes', () => {
    expect(conteoDeZona(RM, CAJAS, new Set())).toEqual({ tiendas: 3, cajas: 19, pendientes: 3 });
  });

  it('registrar baja las pendientes pero no las tiendas ni las cajas', () => {
    expect(conteoDeZona(RM, CAJAS, new Set(['22LGN']))).toEqual({ tiendas: 3, cajas: 19, pendientes: 2 });
  });

  it('con todo registrado quedan cero pendientes', () => {
    expect(conteoDeZona(RM, CAJAS, new Set(['22LGN', '16PQA', '02SCL'])).pendientes).toBe(0);
  });

  it('una zona sin carga da todo en cero', () => {
    expect(conteoDeZona(RM, {}, new Set())).toEqual(CONTEO_VACIO.nacional);
  });

  it('sin tiendas del día tampoco inventa nada', () => {
    expect(conteoDeZona([], CAJAS, new Set())).toEqual({ tiendas: 0, cajas: 0, pendientes: 0 });
  });
});

describe('badgeZona', () => {
  it('el número es el de tiendas SIN REGISTRAR, no el de cajas', () => {
    const b = badgeZona({ tiendas: 3, cajas: 19, pendientes: 3 });
    expect(b.texto).toBe('3');       // no '19'
    expect(b.tono).toBe('pendiente');
  });

  it('explica el número en el detalle: la pestaña sola no alcanza', () => {
    expect(badgeZona({ tiendas: 3, cajas: 19, pendientes: 2 }).detalle)
      .toBe('2 tiendas sin registrar · 19 cajas');
  });

  it('una sola pendiente va en singular', () => {
    expect(badgeZona({ tiendas: 1, cajas: 1, pendientes: 1 }).detalle)
      .toBe('1 tienda sin registrar · 1 caja');
  });

  it('con todo registrado muestra el visto, no un cero', () => {
    const b = badgeZona({ tiendas: 3, cajas: 19, pendientes: 0 });
    expect(b.texto).toBe('✓');
    expect(b.tono).toBe('listo');
    expect(b.detalle).toBe('Todo registrado · 19 cajas en 3 tiendas');
  });

  it('una zona sin carga NO lleva badge: un cero compite con el que sí importa', () => {
    const b = badgeZona({ tiendas: 0, cajas: 0, pendientes: 0 });
    expect(b.texto).toBe('');
    expect(b.tono).toBe('ninguno');
    expect(b.detalle).toBe('Sin congelados este día');
  });
});
