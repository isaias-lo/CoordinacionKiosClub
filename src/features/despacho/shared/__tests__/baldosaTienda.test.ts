import { describe, it, expect } from 'vitest';
import { detalleBaldosa, pctAnillo, pctOdoo, ariaBaldosa, agregadosBaldosa } from '../baldosaTienda';
import { avanceFila } from '../listaTiendas';

const av = (c: Partial<Record<'pallet' | 'bulto' | 'contenedor' | 'chocolate', number>>, f: Partial<Record<'pallet' | 'bulto' | 'contenedor' | 'chocolate', number>> = {}) =>
  avanceFila({ pallet: 0, bulto: 0, contenedor: 0, chocolate: 0, ...c }, { pallet: 0, bulto: 0, contenedor: 0, chocolate: 0, ...f });

describe('detalle de la baldosa', () => {
  it('cargando: pesadas sobre total, pallets con palabra y bultos abreviados', () => {
    expect(detalleBaldosa('curso', av({ pallet: 3, bulto: 1 }, { pallet: 2, bulto: 1 }))).toBe('3/5 pallets · 1/2 b.');
  });

  it('lista: solo totales con ✓', () => {
    expect(detalleBaldosa('lista', av({ pallet: 2 }))).toBe('✓ 2 pallets');
  });

  it('un solo pallet va en singular', () => {
    expect(detalleBaldosa('pendiente', av({}, { pallet: 1 }))).toBe('0/1 pallet');
  });

  it('sin unidades lo dice', () => {
    expect(detalleBaldosa('pendiente', av({}))).toBe('Sin unidades');
    expect(detalleBaldosa('lista', av({}))).toBe('✓ Lista');
  });
});

describe('anillo', () => {
  it('lista siempre completa, aunque falte algo en el conteo', () => {
    expect(pctAnillo('lista', av({ pallet: 1 }, { pallet: 1 }))).toBe(100);
  });
  it('cargando: proporción de pesadas', () => {
    expect(pctAnillo('curso', av({ pallet: 1 }, { pallet: 3 }))).toBe(25);
  });
  it('sin total no divide por cero', () => {
    expect(pctAnillo('pendiente', av({}))).toBe(0);
  });
});

describe('aria-label', () => {
  it('nombre, estado y avance', () => {
    const a = ariaBaldosa({ nombre: 'Buenaventura II', cod: '35 BN2', estado: 'curso', avance: av({ pallet: 1 }, { pallet: 1 }), chip: 'En curso', conGuia: false });
    expect(a).toBe('Buenaventura II (35 BN2), cargando, 1 de 2 pesadas, 1/2 pallets');
  });
  it('suma lo que hay que mirar: sin pesar, guía, agregados y Odoo', () => {
    const a = ariaBaldosa({ nombre: 'Temuco', cod: '20 TEM', estado: 'curso', avance: av({ pallet: 1 }), chip: '1 sin pesar', conGuia: true,
      agregados: { adquisicion: 2, webRetiro: 0 }, odoo: { done: 3, total: 5 } });
    expect(a).toContain('1 sin pesar');
    expect(a).toContain('con guía');
    expect(a).toContain('2 adq.');
    expect(a).toContain('Odoo 3 de 5');
  });
});

describe('agregados', () => {
  it('solo los que existen', () => {
    expect(agregadosBaldosa({ adquisicion: 2, webRetiro: 0 })).toEqual(['2 adq.']);
    expect(agregadosBaldosa({ adquisicion: 0, webRetiro: 1 })).toEqual(['1 web']);
    expect(agregadosBaldosa(undefined)).toEqual([]);
  });
});

describe('pctOdoo', () => {
  it('sin movimientos no hay anillo', () => {
    expect(pctOdoo(undefined)).toBeNull();
    expect(pctOdoo({ done: 0, total: 0 })).toBeNull();
  });
  it('lleva lo hecho sobre el total, sin pasarse', () => {
    expect(pctOdoo({ done: 3, total: 5 })).toBe(60);
    expect(pctOdoo({ done: 5, total: 5 })).toBe(100);
    expect(pctOdoo({ done: 7, total: 5 })).toBe(100);
  });
});
