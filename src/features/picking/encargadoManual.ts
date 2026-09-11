// Reglas de "Encargado manual" en Picking. Puro y testeable: la pantalla decide QUÉ mostrar y
// con qué valores nace el primer pallet, pero las reglas viven acá.

import type { SectionFilter } from './picking-types';
import type { Seccion } from './picking-secciones';

/**
 * ¿Hay que preguntar la sección al crear un encargado manual?
 *
 * Solo en "Todas". Estando dentro de una sección la respuesta ya está sobre la mesa —el filtro
 * activo ES la sección— y volver a elegirla no solo es un paso de más: deja escribir una sección
 * distinta de aquella en la que se está parado, y el encargado recién creado desaparece de la
 * vista al instante porque el filtro lo excluye.
 */
export function pideSeccion(filtro: SectionFilter): boolean {
  return filtro === 'all';
}

/**
 * Sección y `contenido` con los que nace el PRIMER pallet de un encargado manual.
 *
 * `seccion` es el dato fuerte (columna `section`); `contenido` es el fallback con el que
 * `seccionDeSlot` clasifica los pallets viejos que no la tienen. Por eso 'hogar' y 'aseo-comida'
 * comparten contenido: se distinguen por `section`, que acá siempre viaja explícita.
 *
 * "Todas" nace SIN sección y con contenido 'mixto' —que a propósito no matchea ninguna sección—
 * porque "todas" significa "sin sección específica", no "una por cada sección".
 */
export function seccionYContenidoManual(sel: SectionFilter): { seccion: Seccion | null; contenido: string } {
  if (sel === 'all') return { seccion: null, contenido: 'mixto' };
  if (sel === 'chocolates') return { seccion: 'chocolates', contenido: 'chocolate' };
  if (sel === 'congelados') return { seccion: 'congelados', contenido: 'congelados' };
  return { seccion: sel, contenido: 'hogar' };
}

/**
 * Batch (Transferir Agrupación) tal como se guarda: solo los dígitos. El formato "BATCH/N" se
 * aplica recién al mostrarlo. No se recortan ceros a la izquierda —el batch es una etiqueta que
 * alguien compara contra un papel, no un número con el que se opere— y la ausencia es cadena
 * vacía, nunca `undefined`, para que "sin batch" sea un solo caso en todos los puntos de uso.
 */
export function normalizarBatch(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}
