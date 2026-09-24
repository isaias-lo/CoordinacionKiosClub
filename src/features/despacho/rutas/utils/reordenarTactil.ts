// Reordenar una lista vertical con el dedo. La parte PURA: puro cálculo, sin DOM.
//
// El Planificador reordenaba sus paradas solo con `draggable`/`onDrop`, que son eventos de MOUSE:
// en un teléfono no se disparan nunca, así que ahí no había forma de mover una parada. No es que
// costara — no existía.
//
// El arrastre con el dedo hay que armarlo a mano: se sigue el `touchmove`, se pregunta qué
// elemento hay bajo el dedo y se calcula a qué posición correspondería soltar. Lo que vive acá es
// esa última cuenta, que es la que se puede equivocar en silencio.

/**
 * El índice al que corresponde soltar, a partir del `data-idx` del elemento bajo el dedo.
 *
 * Devuelve `null` cuando no hay dónde soltar: fuera de la lista, sobre algo que no es una fila, o
 * un índice que no existe. Null es "no pasó nada", nunca "soltar en 0" — soltar en un lugar que
 * la persona no eligió es peor que no soltar.
 */
export function indiceDestino(raw: string | null | undefined, largo: number): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= largo) return null;
  return n;
}

/**
 * ¿Este movimiento cambia algo?
 *
 * Soltar una parada sobre sí misma no es un reordenamiento: marcar el orden como "manual" por un
 * toque que no movió nada haría que el Planificador dejara de recalcular sin que nadie lo pidiera.
 */
export function esMovimientoReal(desde: number | null, hasta: number | null): boolean {
  return desde != null && hasta != null && desde !== hasta;
}

/** De qué lado de la fila de destino va la línea azul que anuncia dónde va a caer la parada. */
export type LadoLinea = 'arriba' | 'abajo';

/**
 * Dónde dibujar la línea de destino.
 *
 * `reordenar` saca la parada de `desde` y la INSERTA en `hasta` sobre la lista ya acortada. Con eso,
 * bajando queda DESPUÉS de la fila de destino y subiendo queda ANTES. La línea tiene que decir eso
 * mismo o promete un lugar distinto del que va a ocupar.
 */
export function ladoDeLinea(desde: number | null, hasta: number | null): LadoLinea | null {
  if (!esMovimientoReal(desde, hasta)) return null;
  return (desde as number) < (hasta as number) ? 'abajo' : 'arriba';
}
