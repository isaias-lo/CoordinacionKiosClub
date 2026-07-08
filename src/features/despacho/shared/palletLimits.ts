/**
 * Límite físico de altura para pallets en las bodegas (racks / camión).
 * Se usa como `max` de los inputs de "alto" en los flujos de bodega
 * (Santiago y Regiones) y en `LIMITES.pallet.altoMax` de
 * `regiones/data/tiendas.ts`. Mantener sincronizado si cambia el límite.
 */
export const MAX_ALTO_CM = 185;

/** True si la altura ingresada (cm) supera el límite de bodega para pallets. */
export function excedeAltoMax(alto: number): boolean {
  return alto > MAX_ALTO_CM;
}
