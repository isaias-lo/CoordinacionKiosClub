// Qué secciones y qué tipos de unidad corresponden a cada pestaña de Picking. Puro y testeable.
//
// Existe porque la separación Seco / Congelados (#408) quedó a medias: la pestaña Congelados dejó
// de ofrecer las secciones de seco, pero Seco siguió ofreciendo "Congelados" como sección. Y el
// filtro de sección se guarda en el navegador sin reiniciarse al cambiar de pestaña, así que un
// "Chocolates" guardado seguía mandando dentro de Congelados: contaba, imprimía y grababa las cajas
// como si fueran chocolates.

import type { PickerType, SectionFilter } from './picking-types';

/**
 * El filtro que de verdad aplica en la pestaña, a partir del guardado.
 *
 * - En **Congelados** siempre es "Todas": ahí no hay secciones de seco.
 * - En **Seco** nunca es "Congelados": esa sección tiene su propia pestaña.
 */
export function seccionEfectiva(guardada: SectionFilter, esTabCongelados: boolean): SectionFilter {
  if (esTabCongelados) return 'all';
  return guardada === 'congelados' ? 'all' : guardada;
}

/** Los chips de sección que ofrece cada pestaña. */
export function seccionesDeLaPestana(esTabCongelados: boolean): SectionFilter[] {
  return esTabCongelados ? ['all'] : ['all', 'aseo-comida', 'hogar', 'chocolates'];
}

const ORDEN: PickerType[] = ['P', 'C', 'B', 'CH', 'CC', 'CN'];

/**
 * Los contadores que muestra la tarjeta de un encargado, en orden fijo.
 *
 * Las reglas por sección son las de siempre (Congelados solo cajas; Chocolates solo P y CH; Aseo y
 * Hogar sin CH). Lo nuevo: **un tipo que ya tiene unidades se muestra igual**, aunque no sea el de
 * esa sección. Si no, esa unidad existe en la base sin que nadie la pueda ver ni quitar — que es lo
 * que pasaba con el pallet con que nacía el encargado manual de Congelados.
 */
export function tiposDeUnidad(
  isCongelados: boolean, seccion: SectionFilter, conteos: Partial<Record<string, number>> = {},
): PickerType[] {
  const permitido = (t: PickerType): boolean => {
    const esCaja = t === 'CC' || t === 'CN';
    if (isCongelados) return esCaja;
    if (esCaja) return false;
    if (seccion === 'chocolates') return t === 'P' || t === 'CH';
    if (seccion === 'aseo-comida' || seccion === 'hogar') return t !== 'CH';
    return true;
  };
  return ORDEN.filter(t => permitido(t) || (conteos[t] ?? 0) > 0);
}

/**
 * Con qué unidad nace un encargado manual.
 *
 * Antes nacía SIEMPRE con un Pallet: la tarjeta se arma a partir de las unidades del encargado, y
 * algo había que crear para que apareciera. Pero los datos de 30 días dicen otra cosa según la
 * sección — Aseo/Comida 99% P, Hogar 85% P, Chocolates 99% CH — y en Congelados solo se manejan
 * Caja Cartón y Caja Negra. Es un default: el formulario deja elegir otro antes de agregar.
 */
export function primeraUnidadPorDefecto(seccion: SectionFilter): PickerType {
  if (seccion === 'congelados') return 'CC';
  if (seccion === 'chocolates') return 'CH';
  return 'P';
}

/** Las columnas de la vista "Todas" de Seco. Congelados tiene su propia pestaña. */
export type ColumnaSeco = 'aseo-comida' | 'hogar' | 'chocolates' | 'mixto';

/**
 * En qué columna de "Todas" (Seco) cae una tarjeta.
 *
 * Antes se decidía solo por las operaciones de Odoo. Un encargado manual no tiene ninguna, así que
 * TODOS caían en Hogar — también los de Chocolates o Aseo. Ahora quien llama pasa, para un manual,
 * las categorías derivadas de sus unidades (`categoriasDeSlotsManual`), igual que ya hacía la
 * tarjeta para decidir qué contadores mostrar.
 *
 * Un manual sin sección (creado desde "Todas") va a Mixto, que es como se guarda su contenido. Y
 * como en Seco no hay columna de congelados, esa categoría se ignora: la tarjeta nunca queda sin
 * columna, que en esta vista es lo mismo que desaparecer.
 */
export function columnaSeco(categorias: string[], esManual: boolean): ColumnaSeco {
  const cats = new Set(categorias.filter(c => c !== 'Congelados'));
  if (esManual && cats.size === 0) return 'mixto';
  const hogar = cats.has('Hogar');
  const aseoComida = cats.has('Aseo') || cats.has('Comida');
  if (hogar && aseoComida) return 'mixto';
  if (cats.has('Chocolates')) return 'chocolates';
  if (aseoComida) return 'aseo-comida';
  if (hogar) return 'hogar';
  return esManual ? 'mixto' : 'hogar';
}
