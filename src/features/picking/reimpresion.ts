// Reimprimir etiquetas de Picking sin crear pallets fantasma. Puro y testeable.
//
// El caso que lo motivó (51SER, 11/09/2026): el pallet #12718 de Fernanda Mardones se imprimió a
// las 09:xx. A las 10:14 se escribió "Fabian Hernandez" en el nombre de esa tarjeta y, dos segundos
// después, se reimprimió — y esa segunda etiqueta se pegó en OTRO pallet físico. Resultado: dos
// pallets con el mismo #12718, y el de Fabian (414 kg) no existía en el sistema. Bodega lo notó al
// escanear ("ya está en la carga de hoy") y tuvo que crearle un pallet nuevo a mano.
//
// El sistema lo permitía sin decir nada: el botón solo decía "Re-imprimir" y la copia salía
// idéntica a la original. Ahora la copia lo dice en la etiqueta, y antes de imprimirla se explica
// para qué sirve y qué hacer si en realidad es otro pallet (+ en la tarjeta: sale con su propio #).

/**
 * Los pallets que YA se imprimieron, en el momento del clic.
 *
 * `canonical_id` se asigna en la PRIMERA impresión (assignCanonicalIds) y nunca más, así que es la
 * marca de "ya impreso". Pero hay que tomar la foto ANTES de imprimir: la impresión asigna el código
 * primero, y si esto se mirara al dibujar la etiqueta, una primera impresión podría salir marcada
 * como copia según qué tan rápido llegue la actualización. (Los pallets creados en Bodega nacen con
 * código, pero no entran a Picking.)
 */
export function slotsYaImpresos(slots: { id: number; canonical_id?: string | null }[]): Set<number> {
  return new Set(slots.filter(s => !!s.canonical_id).map(s => s.id));
}

interface ContextoReimpresion {
  /** Los #id de las etiquetas que van a salir como copia. */
  ids: number[];
  /** 'HH:MM' de la última impresión, si se sabe. */
  hora?: string | null;
  por?: string | null;
}

/** El texto de la confirmación. Siempre dice qué va a pasar Y qué hacer si no es eso lo que se busca. */
export function mensajeReimpresion({ ids, hora, por }: ContextoReimpresion): string {
  const cuales = ids.length <= 3 ? ids.map(i => `#${i}`).join(', ') : `${ids.length} etiquetas`;
  const cuando = [hora ? `a las ${hora}` : '', por?.trim() ? `por ${por.trim()}` : ''].filter(Boolean).join(' ');
  return `${cuales} ya se ${ids.length === 1 ? 'imprimió' : 'imprimieron'}${cuando ? ` ${cuando}` : ''}. `
    + 'Reimprimir saca una COPIA con el mismo número: sirve solo para reemplazar una etiqueta perdida o dañada. '
    + '¿Es otro pallet? Agrégalo con el + de la tarjeta y sale con su propio número.';
}
