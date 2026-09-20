// Una tarjeta vacía deja de tapar lo que cargó el compañero. Puro y testeable.
//
// El problema, medido el 17/09 con 5 personas: nueve veces alguien volvió a pesar y cargar un
// pallet que otro ya había cargado, entre 13 y 80 minutos después. El ítem del compañero estaba en
// el estado compartido desde el primer segundo — lo que nunca llegaba era el repintado de la
// tarjeta.
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

export interface FilaAdoptable {
  pickingSlotId?: number | null;
  /** true en cuanto la persona escribe algo en esta tarjeta. */
  tocada?: boolean;
  saved?: boolean;
}

export interface ItemRemoto {
  pickingSlotId?: number | null;
}

/**
 * ¿Esta fila puede adoptar el ítem que cargó otra persona?
 *
 * Tres condiciones, y las tres importan:
 *  · No está guardada — si ya se guardó acá, `reconcileSavedRows` se encarga.
 *  · Nadie la tocó — si la persona escribió algo, es suyo y no se pisa.
 *  · Está atada a una unidad de Picking — sin `pickingSlotId` no hay forma de saber qué ítem le toca.
 */
export function puedeAdoptar(fila: FilaAdoptable): boolean {
  return !fila.saved && !fila.tocada && fila.pickingSlotId != null;
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
): { fila: F; item: I }[] {
  const out: { fila: F; item: I }[] = [];
  for (const fila of filas) {
    if (!puedeAdoptar(fila)) continue;
    const item = itemsRemotos.find(i => i.pickingSlotId != null && i.pickingSlotId === fila.pickingSlotId);
    if (item) out.push({ fila, item });
  }
  return out;
}
