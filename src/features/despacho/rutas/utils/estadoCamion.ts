// [Vista A] El estado de una tarjeta de camión, en una palabra: lo que dice el chip de arriba a la
// derecha. Puro: lee lo mismo que la tarjeta ya calculaba (cerrado, exceso, cuántas tiendas lleva).

import type { ExcesoCapacidad } from './sobreCapacidad';

export type TonoCamion = 'cerrado' | 'exceso' | 'armando' | 'vacio';

export function estadoCamion(c: { cerrado: boolean; exceso: ExcesoCapacidad | null; tiendas: number }): { texto: string; tono: TonoCamion } {
  if (c.cerrado) return { texto: '✓ Cerrado', tono: 'cerrado' };
  if (c.exceso) return { texto: `Lleva ${c.exceso.sobran} de más`, tono: 'exceso' };
  if (c.tiendas > 0) return { texto: 'Armando', tono: 'armando' };
  return { texto: 'Vacío', tono: 'vacio' };
}
