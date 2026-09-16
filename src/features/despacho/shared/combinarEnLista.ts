/**
 * Reemplaza dos ítems de una lista por el fusionado, en la posición del PRIMERO de los dos.
 *
 * Suena trivial y no lo es: Nacional empujaba el fusionado al FINAL de la lista. Combinar movía la
 * carga de lugar, y como el número de tarjeta sale de la posición, las etiquetas ya impresas
 * dejaban de corresponder. RM/Costa sí lo insertaba en su lugar; esta es la regla que tenían
 * distinta, ahora en un solo sitio.
 *
 * No renumera: eso lo hace el renumerador de cada espejo, que sabe leer el `seq` del slot.
 */
export function combinarEnLista<T>(lista: readonly T[], aIdx: number, bIdx: number, fusionado: T): T[] {
  const alto = Math.max(aIdx, bIdx);
  const bajo = Math.min(aIdx, bIdx);
  const out = lista.filter((_, i) => i !== alto && i !== bajo);
  out.splice(bajo, 0, fusionado);
  return out;
}
