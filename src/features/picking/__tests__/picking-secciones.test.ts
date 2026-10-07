import { describe, it, expect } from 'vitest';
import {
  normalizarSeccion,
  seccionDeContenido,
  seccionDeGrupo,
  opEnSeccion,
  filtrarOpsPorSeccion,
  seccionDeSlot,
} from '../picking-secciones';
import type { PickingOperation, PalletSlot } from '../picking-types';

const op = (categories: string[]): PickingOperation =>
  ({ categories } as unknown as PickingOperation);

const slot = (p: Partial<Pick<PalletSlot, 'section' | 'contenido'>>): Pick<PalletSlot, 'section' | 'contenido'> =>
  ({ section: p.section ?? null, contenido: p.contenido ?? '' });

describe('normalizarSeccion', () => {
  it('acepta secciones válidas y rechaza el resto', () => {
    expect(normalizarSeccion('comida')).toBe('comida');
    expect(normalizarSeccion('aseo')).toBe('aseo');
    // El valor VIEJO ya no es una sección válida: se resuelve por el contenido (ver seccionDeSlot).
    expect(normalizarSeccion('aseo-comida')).toBeNull();
    expect(normalizarSeccion('hogar')).toBe('hogar');
    expect(normalizarSeccion('chocolates')).toBe('chocolates');
    expect(normalizarSeccion('congelados')).toBe('congelados');
    expect(normalizarSeccion('all')).toBeNull();   // 'all' no es una sección real
    expect(normalizarSeccion('mixto')).toBeNull();
    expect(normalizarSeccion('')).toBeNull();
    expect(normalizarSeccion(null)).toBeNull();
    expect(normalizarSeccion(undefined)).toBeNull();
  });
});

describe('seccionDeContenido (fallback de pallets sin columna section)', () => {
  it('tokens puros', () => {
    expect(seccionDeContenido('hogar')).toBe('hogar');
    expect(seccionDeContenido('aseo')).toBe('aseo');
    expect(seccionDeContenido('comida')).toBe('comida');
    // Desde que son DOS secciones, traer las dos es mixto: no hay una sola a la que pertenezca.
    expect(seccionDeContenido('comida-aseo')).toBeNull();
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
    expect(seccionDeGrupo(['Aseo'])).toBe('aseo');
    expect(seccionDeGrupo(['Comida'])).toBe('comida');
    expect(seccionDeGrupo(['Aseo', 'Comida'])).toBeNull();   // mixto, como Hogar + Comida
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
    expect(opEnSeccion(['Aseo'], 'aseo')).toBe(true);
    expect(opEnSeccion(['Comida'], 'comida')).toBe(true);
    expect(opEnSeccion(['Comida'], 'aseo')).toBe(false);
    expect(opEnSeccion(['Hogar'], 'comida')).toBe(false);
    // Una operación con las DOS aparece en las DOS pestañas: tiene carga de las dos clases.
    expect(opEnSeccion(['Aseo', 'Comida'], 'aseo')).toBe(true);
    expect(opEnSeccion(['Aseo', 'Comida'], 'comida')).toBe(true);
    expect(opEnSeccion(['Hogar'], 'hogar')).toBe(true);
    expect(opEnSeccion(['Chocolates'], 'chocolates')).toBe(true);
    expect(opEnSeccion(['Congelados'], 'congelados')).toBe(true);
  });
  it('recorta a la sección; "all" devuelve todo', () => {
    const ops = [op(['Aseo']), op(['Hogar']), op(['Comida']), op(['Congelados'])];
    expect(filtrarOpsPorSeccion(ops, 'aseo')).toHaveLength(1);
    expect(filtrarOpsPorSeccion(ops, 'hogar')).toHaveLength(1);
    expect(filtrarOpsPorSeccion(ops, 'congelados')).toHaveLength(1);
    expect(filtrarOpsPorSeccion(ops, 'all')).toBe(ops); // misma referencia, sin copia
  });
});

describe('seccionDeSlot (columna section con fallback a contenido)', () => {
  it('usa la columna section explícita si es válida', () => {
    expect(seccionDeSlot(slot({ section: 'comida', contenido: 'mixto' }))).toBe('comida');
    expect(seccionDeSlot(slot({ section: 'hogar', contenido: 'mixto' }))).toBe('hogar');
  });
  it('cae al contenido cuando section es null/ inválida (pallets viejos)', () => {
    expect(seccionDeSlot(slot({ section: null, contenido: 'aseo' }))).toBe('aseo');
    expect(seccionDeSlot(slot({ section: null, contenido: 'hogar' }))).toBe('hogar');
    expect(seccionDeSlot(slot({ section: 'basura', contenido: 'hogar' }))).toBe('hogar');
  });
  it('mixto sin clasificar → null', () => {
    expect(seccionDeSlot(slot({ section: null, contenido: 'mixto' }))).toBeNull();
  });
});

// ── SEPARAR COMIDA DE ASEO, SIN PERDER LO YA GUARDADO (06/10/2026) ─────────────────────────────
//
// Hasta hoy iban juntas en 'aseo-comida'. El coordinador pidió separarlas y los datos lo
// respaldan: de los 286 pallets guardados con esa sección, 158 traían contenido «comida» y 53
// «aseo» — ya venían distinguidos, solo que la pestaña los juntaba.
//
// 'aseo-comida' sigue existiendo en la base y NO se migra. Se resuelve por el contenido, por el
// mismo camino que ya resolvía a los pallets viejos sin columna.
describe('el legado: pallets guardados como «aseo-comida»', () => {
  const slot = (section: string | null, contenido: string | null) =>
    ({ section, contenido } as Parameters<typeof seccionDeSlot>[0]);

  it('los 158 de contenido «comida» caen en COMIDA', () => {
    expect(seccionDeSlot(slot('aseo-comida', 'comida'))).toBe('comida');
  });

  it('los 53 de contenido «aseo» caen en ASEO', () => {
    expect(seccionDeSlot(slot('aseo-comida', 'aseo'))).toBe('aseo');
  });

  it('los ambiguos quedan en «Todas», que es donde corresponde', () => {
    // «completo» (39), «aseo-hogar» (21) y «comida-aseo» (11): no pertenecen a UNA sección.
    // Antes «completo» y «aseo-hogar» ya eran null; el que cambia es «comida-aseo».
    for (const c of ['completo', 'aseo-hogar', 'comida-aseo']) {
      expect(seccionDeSlot(slot('aseo-comida', c))).toBeNull();
    }
  });

  it('una sección NUEVA y válida manda sobre el contenido, como siempre', () => {
    expect(seccionDeSlot(slot('aseo', 'comida'))).toBe('aseo');
  });

  it('un pallet viejo SIN columna sigue cayendo al contenido', () => {
    expect(seccionDeSlot(slot(null, 'comida'))).toBe('comida');
    expect(seccionDeSlot(slot(null, 'hogar'))).toBe('hogar');
    expect(seccionDeSlot(slot(null, 'chocolate'))).toBe('chocolates');
  });

  it('el chocolate y los congelados no los toca la separación', () => {
    expect(seccionDeSlot(slot('chocolates', 'chocolate'))).toBe('chocolates');
    expect(seccionDeSlot(slot('congelados', 'congelados'))).toBe('congelados');
  });
});
