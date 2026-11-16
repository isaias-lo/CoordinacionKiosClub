'use client';

import { estadoTope, textoTope, tituloTope, type EstadoTope } from './topeTienda';

/**
 * El chip del TOPE DE RECEPCIÓN: cuánto piso ocupa la tienda contra cuánto aguanta.
 *
 * Vive en un archivo propio porque lo dibujan dos piezas que ya son compartidas por Nacional y
 * RM/Costa —`FilaTienda` en la lista y `CabeceraTienda` en la tienda abierta—, y el tono tiene
 * que ser el mismo en las dos.
 *
 * ── LOS TONOS ──────────────────────────────────────────────────────────────────────────────────
 *
 * `al-tope` va en NAVY y no en ámbar a propósito. Una tienda justo en 5 de 5 está llena, no está
 * mal; si usara el ámbar, la que de verdad se pasó se perdería entre las que no. El ámbar es el
 * mismo `est-aviso` que la app ya usa para «sin pesar» y «tienda terminada»: quien trabaja en
 * Bodega ya sabe qué significa ese color.
 *
 * Sin tope no se dibuja nada — ver `topeTienda.ts` para por qué «sin tope» no es cero.
 */
const TONO: Record<Exclude<EstadoTope, 'sin-tope'>, string> = {
  dentro:    'text-text-sub bg-bg-2',
  'al-tope': 'text-navy bg-navy/[0.09]',
  excedido:  'text-est-aviso bg-est-aviso-suave ring-1 ring-inset ring-est-aviso/35',
};

export function ChipTope({ piso, tope, grande }: {
  /** Posiciones ocupadas: pallets + contenedores. Ver `pisoOcupado`. */
  piso: number;
  /** El tope declarado de la tienda. `null`/`undefined` = sin tope: no se dibuja. */
  tope?: number | null;
  /** Dentro de la tienda abierta, donde hay aire; en la fila de la lista va chico. */
  grande?: boolean;
}) {
  const estado = estadoTope(piso, tope);
  if (estado === 'sin-tope') return null;
  return (
    <span
      title={tituloTope(piso, tope)}
      className={`flex-shrink-0 rounded-full font-extrabold uppercase whitespace-nowrap tabular-nums
        ${grande ? 'text-rotulo px-2.5 py-0.5' : 'text-rotulo px-2'} ${TONO[estado]}`}>
      {textoTope(piso, tope)}
    </span>
  );
}
