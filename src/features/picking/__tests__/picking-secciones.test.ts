import { describe, it, expect } from 'vitest';
import {
  normalizarSeccion,
  seccionDeContenido,
  seccionDeGrupo,
  opEnSeccion,
  filtrarOpsPorSeccion,
  seccionDeSlot,
  slotEnSeccion,
  seccionIncluye,
  categoriasDeSlotsManual,
} from '../picking-secciones';
import type { PickingOperation, PalletSlot } from '../picking-types';

const op = (categories: string[]): PickingOperation =>
  ({ categories } as unknown as PickingOperation);

const slot = (p: Partial<Pick<PalletSlot, 'section' | 'contenido'>>): Pick<PalletSlot, 'section' | 'contenido'> =>
  ({ section: p.section ?? null, contenido: p.contenido ?? '' });

describe('normalizarSeccion', () => {
  it('acepta secciones válidas y rechaza el resto', () => {
    expect(normalizarSeccion('aseo-comida')).toBe('aseo-comida');
    expect(normalizarSeccion('hogar')).toBe('hogar');
    expect(normalizarSeccion('chocolates')).toBe('chocolates');
    expect(normalizarSeccion('congelados')).toBe('congelados');
    expect(normalizarSeccion('all')).toBeNull();   // 'all' no es una sección real
    expect(normalizarSeccion('mixto')).toBe('mixto'); // sección propia desde el 30/09 (chip Mixto)
    expect(normalizarSeccion('otra-cosa')).toBeNull();
    expect(normalizarSeccion('')).toBeNull();
    expect(normalizarSeccion(null)).toBeNull();
    expect(normalizarSeccion(undefined)).toBeNull();
  });
});

describe('seccionDeContenido (fallback de pallets sin columna section)', () => {
  it('tokens puros', () => {
    expect(seccionDeContenido('hogar')).toBe('hogar');
    expect(seccionDeContenido('aseo')).toBe('aseo-comida');
    expect(seccionDeContenido('comida')).toBe('aseo-comida');
    expect(seccionDeContenido('comida-aseo')).toBe('aseo-comida');
    expect(seccionDeContenido('chocolate')).toBe('chocolates');
    expect(seccionDeContenido('congelados')).toBe('congelados');
  });
  it('tokens mixtos → null (solo cuentan en Todas)', () => {
    expect(seccionDeContenido('mixto')).toBeNull();       // comida + hogar
    expect(seccionDeContenido('aseo-hogar')).toBeNull();  // aseo + hogar
    expect(seccionDeContenido('comida-hogar')).toBeNull();
  });
  it('congelados/chocolate tienen prioridad', () => {
    expect(seccionDeContenido('congelado hogar')).toBe('congelados');
    expect(seccionDeContenido('chocolate hogar')).toBe('chocolates');
  });
  it('vacío/desconocido → null', () => {
    expect(seccionDeContenido('')).toBeNull();
    expect(seccionDeContenido(null)).toBeNull();
    expect(seccionDeContenido('otro')).toBeNull();
  });
});

describe('seccionDeGrupo (espeja getSection de la vista Todas)', () => {
  it('grupo puro', () => {
    expect(seccionDeGrupo(['Aseo'])).toBe('aseo-comida');
    expect(seccionDeGrupo(['Comida'])).toBe('aseo-comida');
    expect(seccionDeGrupo(['Hogar'])).toBe('hogar');
    expect(seccionDeGrupo(['Chocolates'])).toBe('chocolates');
    expect(seccionDeGrupo(['Congelados'])).toBe('congelados');
  });
  it('Hogar + Aseo/Comida → null (mixto), con prioridad sobre choco', () => {
    expect(seccionDeGrupo(['Aseo', 'Hogar'])).toBeNull();
    expect(seccionDeGrupo(['Comida', 'Hogar'])).toBeNull();
    expect(seccionDeGrupo(['Aseo', 'Hogar', 'Chocolates'])).toBeNull();
  });
  it('vacío → null', () => {
    expect(seccionDeGrupo([])).toBeNull();
  });
});

describe('opEnSeccion / filtrarOpsPorSeccion', () => {
  it('inclusión por-op', () => {
    expect(opEnSeccion(['Aseo'], 'aseo-comida')).toBe(true);
    expect(opEnSeccion(['Comida'], 'aseo-comida')).toBe(true);
    expect(opEnSeccion(['Hogar'], 'aseo-comida')).toBe(false);
    expect(opEnSeccion(['Hogar'], 'hogar')).toBe(true);
    expect(opEnSeccion(['Chocolates'], 'chocolates')).toBe(true);
    expect(opEnSeccion(['Congelados'], 'congelados')).toBe(true);
  });
  it('recorta a la sección; "all" devuelve todo', () => {
    const ops = [op(['Aseo']), op(['Hogar']), op(['Comida']), op(['Congelados'])];
    expect(filtrarOpsPorSeccion(ops, 'aseo-comida')).toHaveLength(2);
    expect(filtrarOpsPorSeccion(ops, 'hogar')).toHaveLength(1);
    expect(filtrarOpsPorSeccion(ops, 'congelados')).toHaveLength(1);
    expect(filtrarOpsPorSeccion(ops, 'all')).toBe(ops); // misma referencia, sin copia
  });
});

describe('seccionDeSlot (columna section con fallback a contenido)', () => {
  it('usa la columna section explícita si es válida', () => {
    expect(seccionDeSlot(slot({ section: 'aseo-comida', contenido: 'mixto' }))).toBe('aseo-comida');
    expect(seccionDeSlot(slot({ section: 'hogar', contenido: 'mixto' }))).toBe('hogar');
  });
  it('cae al contenido cuando section es null/ inválida (pallets viejos)', () => {
    expect(seccionDeSlot(slot({ section: null, contenido: 'aseo' }))).toBe('aseo-comida');
    expect(seccionDeSlot(slot({ section: null, contenido: 'hogar' }))).toBe('hogar');
    expect(seccionDeSlot(slot({ section: 'basura', contenido: 'hogar' }))).toBe('hogar');
  });
  it('mixto sin clasificar → null', () => {
    expect(seccionDeSlot(slot({ section: null, contenido: 'mixto' }))).toBeNull();
  });
});

describe('seccionIncluye / slotEnSeccion — la regla única de qué unidad entra en un filtro (30/09)', () => {
  const slot = (section: string | null, contenido = 'hogar') => ({ section, contenido });

  it('las secciones de siempre no cambian: solo entra lo de esa sección', () => {
    expect(slotEnSeccion(slot('hogar'), 'hogar')).toBe(true);
    expect(slotEnSeccion(slot('aseo-comida', 'aseo'), 'hogar')).toBe(false);
    expect(slotEnSeccion(slot('chocolates', 'chocolate'), 'chocolates')).toBe(true);
    expect(slotEnSeccion(slot(null, 'aseo-hogar'), 'hogar')).toBe(false); // mixto sin sección
  });

  it('en Mixto entra todo lo de seco del picker, también lo creado antes desde Aseo u Hogar', () => {
    expect(slotEnSeccion(slot('mixto', 'mixto'), 'mixto')).toBe(true);
    expect(slotEnSeccion(slot('aseo-comida', 'aseo'), 'mixto')).toBe(true);
    expect(slotEnSeccion(slot('hogar'), 'mixto')).toBe(true);
    expect(slotEnSeccion(slot(null, 'mixto'), 'mixto')).toBe(true);
  });

  it('el chocolate y el congelado NO entran en Mixto: tienen su propia sección', () => {
    expect(slotEnSeccion(slot('chocolates', 'chocolate'), 'mixto')).toBe(false);
    expect(slotEnSeccion(slot('congelados', 'congelados'), 'mixto')).toBe(false);
  });

  it('la impresión decide con la misma regla sobre la sección ya calculada', () => {
    expect(seccionIncluye('mixto', 'hogar')).toBe(true);
    expect(seccionIncluye('mixto', null)).toBe(true);
    expect(seccionIncluye('hogar', null)).toBe(false);
  });

  it('una unidad guardada como "mixto" se reconoce y su encargado manual cae en Mixto', () => {
    expect(normalizarSeccion('mixto')).toBe('mixto');
    expect(categoriasDeSlotsManual([slot('mixto', 'mixto')]).sort()).toEqual(['Aseo', 'Hogar']);
  });
});
