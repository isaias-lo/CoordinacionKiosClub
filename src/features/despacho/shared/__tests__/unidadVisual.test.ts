import { describe, it, expect } from 'vitest';
import { avanceTienda, claseUnidad, idActiva, ESTILO_UNIDAD, LETRA_UNIDAD } from '../unidadVisual';

describe('claseUnidad', () => {
  it('entiende los dos nombres de tipo del sistema', () => {
    expect(claseUnidad('pallet')).toBe('pallet');
    expect(claseUnidad('Pallet')).toBe('pallet');
    expect(claseUnidad('P')).toBe('pallet');
    expect(claseUnidad('box')).toBe('bulto');
    expect(claseUnidad('Bulto')).toBe('bulto');
    expect(claseUnidad('Contenedor')).toBe('contenedor');
    expect(claseUnidad('CH')).toBe('chocolate');
  });

  it('lo que no se pesa cae en «agregado», no en un tipo cualquiera', () => {
    expect(claseUnidad('adquisicion')).toBe('agregado');
    expect(claseUnidad('WebRetiro')).toBe('agregado');
    expect(claseUnidad('')).toBe('agregado');
  });

  it('cada clase tiene su estilo, y cada tipo que se pesa su letra', () => {
    for (const c of ['pallet', 'bulto', 'contenedor', 'chocolate', 'agregado'] as const) {
      expect(ESTILO_UNIDAD[c].texto).toMatch(/^text-/);
    }
    expect(Object.values(LETRA_UNIDAD)).toEqual(['P', 'B', 'C', 'CH']);
  });
});

describe('avanceTienda', () => {
  it('cuenta pesadas sobre el total, por tipo', () => {
    const a = avanceTienda([
      { tipo: 'pallet', pesada: true },
      { tipo: 'pallet', pesada: false },
      { tipo: 'box', pesada: true },
    ]);
    expect(a.pesadas).toBe(2);
    expect(a.total).toBe(3);
    expect(a.porTipo).toEqual([
      { clase: 'pallet', pesadas: 1, total: 2 },
      { clase: 'bulto', pesadas: 1, total: 1 },
    ]);
  });

  it('las unidades que Picking imprimió y no tienen tarjeta suman al total', () => {
    const a = avanceTienda([{ tipo: 'pallet', pesada: true }], { pallet: 2, bulto: 3 });
    expect(a.pesadas).toBe(1);
    expect(a.total).toBe(6);
    expect(a.porTipo).toEqual([
      { clase: 'pallet', pesadas: 1, total: 3 },
      { clase: 'bulto', pesadas: 0, total: 3 },
    ]);
  });

  it('adquisición y web/retiro no entran: no se pesan y la tienda nunca llegaría al 100%', () => {
    const a = avanceTienda([
      { tipo: 'pallet', pesada: true },
      { tipo: 'adquisicion', pesada: false },
      { tipo: 'WebRetiro', pesada: false },
    ]);
    expect(a).toEqual({ pesadas: 1, total: 1, porTipo: [{ clase: 'pallet', pesadas: 1, total: 1 }] });
  });

  it('un tipo sin unidades no ocupa lugar', () => {
    expect(avanceTienda([]).porTipo).toEqual([]);
  });

  it('el orden es el de las tarjetas: pallet, contenedor, bulto, chocolate', () => {
    const a = avanceTienda([
      { tipo: 'Chocolate', pesada: true },
      { tipo: 'Bulto', pesada: true },
      { tipo: 'Contenedor', pesada: true },
      { tipo: 'Pallet', pesada: true },
    ]);
    expect(a.porTipo.map(t => t.clase)).toEqual(['pallet', 'contenedor', 'bulto', 'chocolate']);
  });
});

describe('idActiva', () => {
  const filas = [
    { id: 'a', pickingSlotId: 10 },
    { id: 'b', pickingSlotId: 11 },
    { id: 'c' },
  ];

  it('sin nada elegido, la primera de la cola', () => {
    expect(idActiva(filas, {})).toBe('a');
  });

  it('el escaneo gana sobre lo elegido a dedo: ese pallet está en la balanza', () => {
    expect(idActiva(filas, { foco: 11, elegida: 'a' })).toBe('b');
  });

  it('respeta lo que se tocó mientras siga pendiente', () => {
    expect(idActiva(filas, { elegida: 'c' })).toBe('c');
  });

  it('si lo elegido ya se guardó, vuelve a la primera', () => {
    expect(idActiva([{ id: 'b', pickingSlotId: 11 }], { elegida: 'a' })).toBe('b');
  });

  it('un escaneo a una unidad que no está pendiente no cambia lo elegido', () => {
    expect(idActiva(filas, { foco: 99, elegida: 'b' })).toBe('b');
  });

  it('sin pendientes no hay tarjeta abierta', () => {
    expect(idActiva([], { foco: 10, elegida: 'a' })).toBeNull();
  });
});
