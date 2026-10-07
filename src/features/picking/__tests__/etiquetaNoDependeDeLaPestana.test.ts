import { describe, it, expect } from 'vitest';
import { categoriasDelGrupo } from '../picking-secciones';

// ── EL CASO 41ANA DEL 07/10/2026 ──────────────────────────────────────────────────────────────
//
// Cristian Morales hizo DOS operaciones de Odoo en el mismo batch BATCH/DT/59412 —una de Aseo
// (99REC/DT/136734) y una de Hogar (99REC/DT/136712)— y armó UN solo pallet, el slot #1533.
//
// La base lo guardó bien: `contenido = 'aseo-hogar'`, las dos refs. Pero la etiqueta impresa
// desde la pestaña HOGAR decía solo «Hogar», porque los chips salían de las operaciones
// RECORTADAS por el filtro. El mismo pallet imprimía distinto según la pestaña.

const ASEO  = { categories: ['Aseo'] };
const HOGAR = { categories: ['Hogar'] };
const slot  = (section: string, contenido: string) => ({ section, contenido });

describe('la etiqueta dice lo que lleva el pallet, no lo que filtra la pestaña', () => {
  it('EL CASO: desde HOGAR, desde ASEO o desde TODAS, la misma etiqueta', () => {
    const slots = [slot('hogar', 'aseo-hogar')];
    const completas = [ASEO, HOGAR];
    // Lo que cambia entre pestañas son las ops RECORTADAS; las completas son siempre las mismas.
    const desdeTodas = categoriasDelGrupo(completas, slots);
    const desdeHogar = categoriasDelGrupo(completas, slots);
    const desdeAseo  = categoriasDelGrupo(completas, slots);
    expect(desdeTodas).toEqual(['Aseo', 'Hogar']);
    expect(desdeHogar).toEqual(desdeTodas);
    expect(desdeAseo).toEqual(desdeTodas);
  });

  it('pasarle las recortadas es justamente el bug: por eso el llamador manda las completas', () => {
    // Deja escrito qué NO hay que pasarle. Si alguien vuelve a enchufar `group.operations`
    // (recortado por sección), este test explica el síntoma que vuelve.
    expect(categoriasDelGrupo([HOGAR], [slot('hogar', 'aseo-hogar')])).toEqual(['Hogar']);
  });

  it('no repite una categoría que esté en varias operaciones', () => {
    expect(categoriasDelGrupo([HOGAR, HOGAR, ASEO], [])).toEqual(['Hogar', 'Aseo']);
  });
});

describe('encargado manual: sin operaciones de Odoo', () => {
  it('cae a los pallets, que es de donde ya salían', () => {
    expect(categoriasDelGrupo([], [slot('hogar', 'hogar')])).toEqual(['Hogar']);
  });

  it('y un manual MIXTO sigue leyendo su contenido', () => {
    // Lo que arregló el #686: un mixto manual no tiene UNA sección, y la franja salía en blanco.
    expect(categoriasDelGrupo([], [slot('aseo-comida', 'comida-aseo')])).toEqual(['Comida', 'Aseo']);
  });

  it('sin operaciones y sin pallets, sin chips', () => {
    expect(categoriasDelGrupo([], [])).toEqual([]);
  });
});
