import { sumPeso } from './combineUtils';

/**
 * Suma un peso base + VARIOS pesos (kg), redondeando en cada paso con `sumPeso` para evitar el
 * drift de punto flotante (0.1 + 0.2). Es el núcleo de "sumar varios bultos/CH a un pallet" de
 * una sola vez: acumular con reduce (NO loopear `sumarBultoAPallet`, que en un loop síncrono
 * leería el peso del destino desactualizado entre iteraciones).
 */
export function sumarPesoMultiple(base: number, pesos: number[]): number {
  return pesos.reduce((acc, p) => sumPeso(acc, p), base || 0);
}
