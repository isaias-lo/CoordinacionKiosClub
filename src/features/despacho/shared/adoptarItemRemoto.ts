// Una tarjeta vacía deja de tapar lo que cargó el compañero. Puro y testeable.
//
// El problema, medido el 17/09 sobre `actividad_bodega`: de 48 unidades cargadas, 10 las volvió a
// pesar otra persona obteniendo el MISMO peso, de 0 a 44 minutos después (5 de ellas a más de 10
// minutos, que es demasiado para un choque de sincronía). El ítem del compañero estaba en el estado
// compartido desde el primer segundo — lo que nunca llegaba era el repintado de la tarjeta.
//
// Por qué: hay tres efectos que tocan `formRows` y los tres se desentienden de una tarjeta vacía.
//
//   · La reconstrucción completa solo corre al ENTRAR a la tienda (deps `[selectedTienda]`).
//   · `reconcileSavedRows` salta cualquier fila no guardada: «no pisar lo que alguien escribe».
//   · El backfill solo crea tarjetas para slots SIN tarjeta, y una vacía ya cuenta como tarjeta.
//
// Resultado: si existe una tarjeta vacía para ese slot y llega el ítem del compañero, ningún código
// puede tocarla. Queda así hasta salir de la tienda y volver — que es justo lo que nadie hace
// cuando tiene la tarjeta vacía delante: la llena.
//
// Lo demoledor es que el sistema SÍ sabe construirla llena: lo hace cuando la tarjeta todavía no
// existía. La diferencia entre verla llena o vacía era solo si el slot de Picking llegó antes o
// después que el ítem.
//
// La guarda original no estaba mal, estaba mal medida: `!row.saved` significa «esta tarjeta nunca
// se guardó EN ESTE equipo», no «alguien está escribiendo acá». Una tarjeta recién nacida en blanco
// caía en la misma bolsa que una a medio llenar, y no tenía ninguna condición de salida.
//
// Acá se separa: una fila que la persona TOCÓ no se pisa nunca. Una que nadie tocó sí puede
// adoptar lo que cargó el compañero.

import { leerTaraPallet } from './pesoDelPallet';

export interface FilaAdoptable {
  pickingSlotId?: number | null;
  /** true en cuanto la persona escribe algo en esta tarjeta. */
  tocada?: boolean;
  saved?: boolean;
  /** Reabierta a propósito tras unificar o sumar: espera que confirmen la altura. */
  mergeReopened?: boolean;
  /** Reabierta con «Editar». */
  editando?: boolean;
}

export interface ItemRemoto {
  pickingSlotId?: number | null;
}

/**
 * ¿Esta fila puede adoptar el ítem que cargó otra persona?
 *
 * Cuatro condiciones, y las cuatro importan:
 *  · No está guardada — si ya se guardó acá, `reconcileSavedRows` se encarga.
 *  · Nadie la tocó — si la persona escribió algo, es suyo y no se pisa.
 *  · No se reabrió a propósito (Editar, unificar, sumar) — el ítem de esa unidad sigue guardado
 *    mientras tanto; adoptarlo cerraría la tarjeta en la cara de quien la abrió para corregirla.
 *  · Está atada a una unidad de Picking — sin `pickingSlotId` no hay forma de saber qué ítem le toca.
 */
export function puedeAdoptar(fila: FilaAdoptable): boolean {
  return !fila.saved && !fila.tocada && !fila.mergeReopened && !fila.editando && fila.pickingSlotId != null;
}

/**
 * Empareja las filas vacías e intactas con el ítem remoto de su misma unidad de Picking.
 *
 * Devuelve solo los emparejamientos: quién rellena qué fila. La construcción de la tarjeta la hace
 * cada espejo, que habla su propio vocabulario (Nacional usa `pkg`, RM/Costa usa `tipo`).
 *
 * Si no hay nada que adoptar devuelve una lista vacía, para que el llamador pueda devolver el mismo
 * array y no provocar un render de más.
 */
export function adopcionesPendientes<F extends FilaAdoptable, I extends ItemRemoto>(
  filas: readonly F[],
  itemsRemotos: readonly I[],
  mismaCarga?: (fila: F, item: I) => boolean,
): { fila: F; item: I }[] {
  const out: { fila: F; item: I }[] = [];
  for (const fila of filas) {
    // Una fila tocada tampoco se pisa… salvo que diga exactamente lo mismo que el ítem guardado.
    // Pasa cuando la tarjeta nació llena desde el slot de Picking (que ya tiene el peso del
    // compañero) y la persona solo la enfocó o la escaneó: sin esto, quedaba «sin guardar» para
    // siempre en este equipo aunque la unidad estuviera guardada.
    const tocadaIgual = !!fila.tocada && !!mismaCarga && puedeAdoptar({ ...fila, tocada: false });
    if (!puedeAdoptar(fila) && !tocadaIgual) continue;
    const item = itemsRemotos.find(i => i.pickingSlotId != null && i.pickingSlotId === fila.pickingSlotId);
    if (!item) continue;
    if (fila.tocada && !mismaCarga!(fila, item)) continue;
    out.push({ fila, item });
  }
  return out;
}

/**
 * ¿La tarjeta dice el mismo peso y alto que el ítem? Solo para tarjetas sin «Peso del pallet»:
 * ahí lo escrito es el bruto y lo guardado el neto, y no se pueden comparar.
 */
export function mismaCargaEscrita(
  fila: { peso: string; alto: string; pesoPallet?: string },
  item: { peso?: number | null; alto?: number | null },
): boolean {
  if (leerTaraPallet(fila.pesoPallet) !== 0) return false;
  const peso = Number(String(fila.peso).trim().replace(',', '.'));
  const alto = Number(String(fila.alto).trim().replace(',', '.'));
  if (!Number.isFinite(peso) || peso <= 0 || item.peso == null) return false;
  return Math.abs(peso - Number(item.peso)) < 0.01 && (Number.isFinite(alto) ? alto : 0) === Number(item.alto ?? 0);
}
