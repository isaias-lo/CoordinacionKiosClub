// Qué caja es, escrito en la etiqueta impresa. PURO.
//
// Isaias, 10/11/2026: «cuando generan una caja de cartón o una negra, que se vea reflejado en la
// misma hoja, ya que al momento de generar las hojas no saben cuál es cuál».
//
// El chocolate lleva el tipo `CH` para las DOS cajas (la caja viaja aparte, en `subtipo`; ver
// `subtipoCaja.ts`), así que la etiqueta decía «CH-3» tanto para una negra como para una de cartón.
// En Congelados el tipo sí distingue (`CC` / `CN`), pero como sigla: hay que saber de memoria cuál
// es cuál. Esta función da la palabra, y `null` para todo lo que no es una caja.

import { subtipoDeCaja, type SubtipoCaja } from './subtipoCaja';

export type CajaEtiqueta = { caja: SubtipoCaja; texto: string };

/**
 * La caja de una unidad, para rotularla en la etiqueta. `null` = no es una caja (pallet, bulto,
 * contenedor): la etiqueta sale como siempre.
 *
 * Un chocolate sin subtipo se lee como NEGRA, igual que en el resto del sistema (`subtipoDeCaja`).
 */
export function cajaDeLaEtiqueta(tipo: unknown, subtipo?: unknown): CajaEtiqueta | null {
  const t = String(tipo ?? '').trim().toUpperCase();
  let caja: SubtipoCaja;
  if (t === 'CH') caja = subtipoDeCaja(subtipo);
  else if (t === 'CN') caja = 'negra';
  else if (t === 'CC') caja = 'carton';
  else return null;
  return { caja, texto: caja === 'carton' ? 'CAJA CARTÓN' : 'CAJA NEGRA' };
}
