// Lo decidible de «qué caja es este chocolate» en la tarjeta del formulario. PURO.
//
// Vive aparte de `ChipCaja.tsx` porque este repositorio no testea render de componentes: la parte
// que decide se extrae y se testea, el componente queda de dibujo.

import { etiquetaSubtipo, type SubtipoCaja } from './subtipoCaja';

/** El número como se escribe en Chile: `3,3` y no `3.3`. */
export function enKg(n: number): string {
  return String(n).replace('.', ',');
}

/**
 * La palabra que distingue una caja de la otra: «Negra» / «Cartón».
 *
 * Se le saca el «Caja » porque se repite en las dos y no aporta nada — y en una píldora de una
 * línea a 390 px, cada carácter que no distingue le quita lugar al que sí.
 */
export function palabraDeCaja(caja: SubtipoCaja): string {
  return etiquetaSubtipo(caja).replace(/^Caja\s+/i, '');
}

/**
 * La franja del borde izquierdo de la tarjeta, por caja.
 *
 * Son 6 px y no chocan con nada: en la columna del formulario ninguna tarjeta usa franja, y los
 * colores (negro y kraft) no están en el vocabulario de la LISTA de tiendas, donde una franja
 * azul, verde o celeste significa otra cosa. Ver `ListaTiendasUI.claseFila`.
 */
export function franjaDeCaja(caja: SubtipoCaja | null | undefined): string {
  if (!caja) return '';
  return caja === 'carton'
    ? 'border-l-[6px] border-l-caja-carton-borde'
    : 'border-l-[6px] border-l-caja-negra';
}
