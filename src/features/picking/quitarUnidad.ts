// Qué unidad saca el «−» de un contador. PURO.
//
// ── POR QUÉ EXISTE (12 oct 2026) ──────────────────────────────────────────────────────────────
//
// Isaias: «no borraba pallet ni bultos cuando ingresabas a la operación». Se reprodujo con la red
// lenta de un teléfono en bodega: tocar «+» y enseguida «−» (corregir un toque de más es lo más
// normal del mundo) no borraba nada. El contador bajaba y a los segundos volvía a subir.
//
// El «+» pone al instante una unidad PROVISORIA (id negativo) mientras el alta viaja. El «−»
// tomaba la última de la lista —esa provisoria— y mandaba a borrar el id negativo: el servidor
// no encontraba nada que borrar, contestaba «ok», y cuando el alta volvía con su id real la
// unidad reaparecía. En la base quedaba la unidad que la persona creyó haber quitado.
//
// Ahora, si la última es provisoria, no se borra en el servidor: se CANCELA el alta, y cuando
// vuelva se borra la real (ver `cancelarAltas` en PickingScreen).

export interface UnidadCandidata { id: number }

export type Quitar<T> =
  | { tipo: 'borrar'; slot: T }        // unidad guardada: DELETE normal
  | { tipo: 'cancelar-alta'; slot: T } // alta en viaje: se cancela y se borra al volver
  | { tipo: 'nada' };

/** Una unidad provisoria es la que el «+» puso mientras su alta viaja al servidor. */
export const esProvisoria = (slot: UnidadCandidata) => slot.id < 0;

/**
 * La unidad que saca el «−»: la última que coincide, como siempre. Lo único nuevo es decir si
 * está guardada o todavía viajando, porque cada caso se quita distinto.
 */
export function unidadAQuitar<T extends UnidadCandidata>(candidatas: readonly T[]): Quitar<T> {
  const slot = candidatas.at(-1);
  if (!slot) return { tipo: 'nada' };
  return esProvisoria(slot) ? { tipo: 'cancelar-alta', slot } : { tipo: 'borrar', slot };
}
