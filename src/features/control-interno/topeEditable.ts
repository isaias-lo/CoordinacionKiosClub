// Lo que se teclea en la casilla de «Topes» → lo que se manda a la base.
//
// Vive aparte de `TopesTab.tsx` para poder testearlo sin montar la tabla. Es el punto donde un
// descuido se paga caro: la casilla vacía y el cero se parecen en pantalla y significan cosas
// opuestas —«sin tope» contra «no recibe nada»—, y un tope de cero dejaría a la tienda en ámbar
// permanente desde el primer pallet.

/** Mínimo y máximo aceptables. Los mismos que valida `TopeTiendaSchema` en el servidor. */
export const TOPE_MIN = 1;
export const TOPE_MAX = 20;

/**
 * - `null`      → vacío: «sin tope», que es un valor legítimo y es cómo se borra uno mal cargado.
 * - `number`    → un tope válido.
 * - `undefined` → no se puede guardar: hay que avisar y no mandar nada.
 *
 * El cero cae en `undefined` a propósito: quien quiere decir «esta tienda no tiene tope» borra la
 * casilla. Nadie declara que una tienda no puede recibir ni un pallet.
 */
export function topeDesdeTexto(txt: string): number | null | undefined {
  const t = (txt ?? '').trim();
  if (t === '') return null;
  if (!/^\d{1,2}$/.test(t)) return undefined;
  const n = Number(t);
  return n >= TOPE_MIN && n <= TOPE_MAX ? n : undefined;
}
