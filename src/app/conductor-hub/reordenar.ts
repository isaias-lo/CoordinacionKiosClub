/**
 * [Panel Conductor · Fase 2] Mover una parada un puesto arriba/abajo en la lista local, antes de
 * confirmar. Puro y testeable — la confirmación (el PATCH a /api/rutas-despacho) vive en
 * `page.tsx`, esto solo calcula el arreglo resultante.
 *
 * Se usan flechas arriba/abajo en vez de arrastrar: es el mismo terreno donde el chofer usa la
 * app con una mano y en movimiento — un drag táctil (ghost + elementFromPoint, como en
 * ManualDispatch.tsx) es un gesto que compite con el scroll de la lista y es fácil fallarlo sin
 * querer en el celular. Con flechas el objetivo es inequívoco y funciona igual en Android/iOS.
 */
export function moverEnLista<T>(lista: T[], index: number, direccion: -1 | 1): T[] {
  const destino = index + direccion;
  if (destino < 0 || destino >= lista.length) return lista;
  const copia = [...lista];
  [copia[index], copia[destino]] = [copia[destino], copia[index]];
  return copia;
}
