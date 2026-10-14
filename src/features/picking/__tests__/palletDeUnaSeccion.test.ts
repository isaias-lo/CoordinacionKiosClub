import { describe, it, expect } from 'vitest';
import { categoriasDelPallet, cargaDePalletNuevo, seccionSecaDelPallet } from '../picking-secciones';

// ── EL CASO 20CTC DEL 14/10/2026 ──────────────────────────────────────────────────────────────
//
// Josue Suazo tenía una operación de Aseo (139138) y una de Hogar (139036). En la pestaña ASEO armó
// el slot #2622 (`section = 'aseo'`) y salió con `contenido = 'aseo-hogar'`, las dos referencias y
// la etiqueta «Hogar · Aseo».

const ASEO  = { name: '99REC/DT/139138', categories: ['Aseo'] };
const HOGAR = { name: '99REC/DT/139036', categories: ['Hogar'] };
const GRUPO = ['Aseo', 'Hogar'];

describe('la etiqueta de un pallet hecho dentro de una sección', () => {
  it('EL CASO: creado en Aseo, dice solo Aseo', () => {
    expect(categoriasDelPallet({ section: 'aseo' }, GRUPO)).toEqual(['Aseo']);
  });

  it('el de Hogar del mismo encargado dice solo Hogar', () => {
    expect(categoriasDelPallet({ section: 'hogar' }, GRUPO)).toEqual(['Hogar']);
  });

  it('creado en Todas (sin sección) sigue nombrando todo el grupo: así se arma uno mixto', () => {
    expect(categoriasDelPallet({ section: null }, GRUPO)).toEqual(GRUPO);
  });

  it('una sección vieja que ya no existe (aseo-comida) no manda: cae al grupo', () => {
    expect(categoriasDelPallet({ section: 'aseo-comida' }, ['Comida', 'Aseo'])).toEqual(['Comida', 'Aseo']);
  });

  it('chocolates y congelados no se tocan: los resuelve su propia regla', () => {
    expect(seccionSecaDelPallet({ section: 'chocolates' })).toBeNull();
    expect(seccionSecaDelPallet({ section: 'congelados' })).toBeNull();
    expect(categoriasDelPallet({ section: 'congelados' }, ['Congelados'])).toEqual(['Congelados']);
  });

  it('sin pallet (vista previa vacía) usa el grupo', () => {
    expect(categoriasDelPallet(undefined, GRUPO)).toEqual(GRUPO);
  });
});

describe('lo que se guarda al crear el pallet', () => {
  it('EL CASO: en Aseo lleva contenido aseo y solo la referencia de Aseo', () => {
    const r = cargaDePalletNuevo('aseo', [ASEO, HOGAR], 'aseo-hogar');
    expect(r.contenido).toBe('aseo');
    expect(r.ops.map(o => o.name)).toEqual(['99REC/DT/139138']);
  });

  it('en Todas, el grupo completo como antes', () => {
    const r = cargaDePalletNuevo(null, [ASEO, HOGAR], 'aseo-hogar');
    expect(r.contenido).toBe('aseo-hogar');
    expect(r.ops).toHaveLength(2);
  });

  it('si la sección no tiene operaciones propias del grupo, no inventa: grupo completo', () => {
    const r = cargaDePalletNuevo('comida', [ASEO, HOGAR], 'aseo-hogar');
    expect(r.contenido).toBe('aseo-hogar');
  });

  it('encargado manual (sin operaciones) dentro de una sección: esa sección', () => {
    const r = cargaDePalletNuevo('hogar', [], 'hogar');
    expect(r).toEqual({ contenido: 'hogar', ops: [] });
  });

  it('chocolates no es seca: devuelve el grupo y el llamador fuerza chocolate', () => {
    expect(cargaDePalletNuevo('chocolates', [ASEO], 'aseo').contenido).toBe('aseo');
  });
});
