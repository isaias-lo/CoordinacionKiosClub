// Qué dice el botón que registra las cajas de una tienda. Puro y testeable.
//
// Existe por C-02 (11/09/2026): la grilla se redibujaba bajo el dedo y un click podía abrir el
// modal de otra tienda. La causa se ataca no dibujando la grilla hasta tener los datos completos;
// esto es la segunda línea: que el botón que ESCRIBE diga sobre qué tienda va a escribir. El código
// de tienda está arriba en la cabecera del modal, lejos del botón que se aprieta.

import { formatCod } from '../../rutas/utils/helpers';

/**
 * Ej.: `Registrar 4 cajas · 16 PQA`. Con una sola caja, "1 caja".
 * Sin cajas el botón está deshabilitado, pero igual se nombra la tienda.
 */
export function textoRegistrar(cc: number, cn: number, cod: string): string {
  const total = Math.max(0, cc) + Math.max(0, cn);
  const cajas = `${total} ${total === 1 ? 'caja' : 'cajas'}`;
  return `Registrar ${cajas} · ${formatCod(cod)}`;
}
