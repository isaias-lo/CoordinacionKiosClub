import { describe, it, expect } from 'vitest';
import { categoriasDeSlotsManual, categoriasDeContenido } from '../picking-secciones';

// ── LA ETIQUETA QUE SALÍA SIN DECIR QUÉ LLEVA ─────────────────────────────────────────────────
//
// Un encargado MANUAL no tiene operaciones de Odoo, así que la franja de la etiqueta se deduce de
// la SECCIÓN del pallet. Y un pallet mixto no tiene una sola sección: `seccionDeSlot` devuelve
// `null` y la franja salía en blanco. Pasa hoy, y pasaba antes de separar Comida y Aseo.
//
// Medido el 07/10/2026 sobre `picking_pallets`, agrupando contenido × section: **78 slots**
// imprimen la franja vacía. De esos, 34 los nombra su propio `contenido`:
//
//     aseo-hogar  / 'aseo-comida'   21
//     comida-aseo / 'aseo-comida'   11
//     comida-aseo / sin section      2
//
// Los otros 44 dicen «completo», que no nombra ninguna categoría: siguen en blanco, y eso es una
// pregunta para el coordinador, no algo que se pueda adivinar acá.

// `contenido` nunca es null en la base; `section` sí puede venir vacía.
const slot = (section: string, contenido: string) => ({ section, contenido });

describe('un pallet MIXTO ya dice qué lleva', () => {
  it('EL CASO comida-aseo: la franja sale del contenido', () => {
    expect(categoriasDeSlotsManual([slot('aseo-comida', 'comida-aseo')])).toEqual(['Comida', 'Aseo']);
  });

  it('EL CASO aseo-hogar, que son 21 slots', () => {
    expect(categoriasDeSlotsManual([slot('aseo-comida', 'aseo-hogar')])).toEqual(['Aseo', 'Hogar']);
  });

  it('sin columna `section`, igual', () => {
    expect(categoriasDeSlotsManual([slot('', 'comida-aseo')])).toEqual(['Comida', 'Aseo']);
  });

  it('«completo» NO se adivina: sigue en blanco', () => {
    // Son 44 slots. Decidir que «completo» son las cinco categorías sería escribir en el papel
    // algo que nadie verificó, y esa hoja la lee quien carga el camión.
    expect(categoriasDeSlotsManual([slot('aseo-comida', 'completo')])).toEqual([]);
  });
});

describe('lo que YA funcionaba no se mueve', () => {
  it('con sección válida manda la sección, no el contenido', () => {
    // 152 slots dicen contenido 'aseo-hogar' con section 'hogar'. Siguen imprimiendo Hogar.
    expect(categoriasDeSlotsManual([slot('hogar', 'aseo-hogar')])).toEqual(['Hogar']);
    expect(categoriasDeSlotsManual([slot('chocolates', 'chocolate')])).toEqual(['Chocolates']);
  });

  it('el legado «aseo-comida» se sigue resolviendo por el contenido de UNA sola', () => {
    expect(categoriasDeSlotsManual([slot('aseo-comida', 'comida')])).toEqual(['Comida']);
    expect(categoriasDeSlotsManual([slot('aseo-comida', 'aseo')])).toEqual(['Aseo']);
  });

  it('varios pallets se unen sin repetir, y sin inventar orden', () => {
    const r = categoriasDeSlotsManual([
      slot('comida', 'comida'), slot('aseo-comida', 'comida-aseo'), slot('hogar', 'hogar'),
    ]);
    expect(new Set(r)).toEqual(new Set(['Comida', 'Aseo', 'Hogar']));
  });

  it('sin pallets, sin franja', () => {
    expect(categoriasDeSlotsManual([])).toEqual([]);
  });
});

describe('categoriasDeContenido — el mismo vocabulario difuso', () => {
  it('reconoce las cinco', () => {
    expect(categoriasDeContenido('comida')).toEqual(['Comida']);
    expect(categoriasDeContenido('aseo')).toEqual(['Aseo']);
    expect(categoriasDeContenido('hogar')).toEqual(['Hogar']);
    expect(categoriasDeContenido('chocolate')).toEqual(['Chocolates']);
    expect(categoriasDeContenido('congelados')).toEqual(['Congelados']);
  });

  it('acepta los sinónimos que ya usaba `seccionDeContenido`', () => {
    expect(categoriasDeContenido('alimentos')).toEqual(['Comida']);
    expect(categoriasDeContenido('limpieza')).toEqual(['Aseo']);
    expect(categoriasDeContenido('bazar')).toEqual(['Hogar']);
  });

  it('devuelve TODAS las que nombre, que es en lo que se diferencia de `seccionDeContenido`', () => {
    expect(categoriasDeContenido('comida-aseo-hogar')).toEqual(['Comida', 'Aseo', 'Hogar']);
  });

  it('sin dato, nada', () => {
    expect(categoriasDeContenido('')).toEqual([]);
    expect(categoriasDeContenido(null)).toEqual([]);
    expect(categoriasDeContenido(undefined)).toEqual([]);
    expect(categoriasDeContenido('completo')).toEqual([]);
  });
});
