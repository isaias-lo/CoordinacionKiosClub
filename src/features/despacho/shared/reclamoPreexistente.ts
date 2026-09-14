// Qué hacer cuando se reclama un pallet que YA está en la carga de hoy. Puro y testeable.
//
// Existe por un callejón sin salida con dos carteles que se contradicen:
//
//   1. Restaurar un pallet borrado que ya estaba restaurado devolvía 409 `ya_existe`, y el diálogo
//      decía: «ya fue restaurado. Toca "Agregar" para sumarlo a la carga».
//   2. Tocar "Agregar" llamaba a claim-bodega, que devolvía 409 `ya_en_carga` y decía:
//      «ya está en la carga de hoy. Búscalo en la lista — no hace falta agregarlo de nuevo».
//
// Uno manda a agregarlo y el otro dice que no hace falta. Y el pallet NO estaba en la lista, así
// que no había nada que buscar: el formulario materializa sus filas al cambiar de tienda, y un slot
// que aparece después —restaurado por otra persona, o por uno mismo en un intento anterior— no se
// agrega solo. La base decía que el pallet estaba; la pantalla, que no. Sin salida.
//
// La causa de fondo es dónde se puso el guard. El servidor rechazaba el reclamo para evitar una
// SEGUNDA fila del mismo pallet físico, pero eso es un problema del formulario, no de la base: el
// pallet es de esta tienda y es de hoy, así que el reclamo es legítimo. El servidor devuelve el
// slot y es el cliente el que decide si ya lo tiene a la vista.

/** Lo mínimo para reconocer una fila/ítem ya vinculado a un slot de picking. */
export interface ConSlot { pickingSlotId?: number | null }

export type AccionReclamo =
  /** No está en pantalla: hay que materializarlo. Es el caso que estaba roto. */
  | 'agregar'
  /** Ya está a la vista: no se duplica, solo se avisa dónde. */
  | 'ya_visible';

/**
 * Decide qué hacer con un slot que el servidor confirmó como "ya en la carga de hoy".
 *
 * Se mira el `pickingSlotId`, no el número impreso ni el orden: es la única llave que identifica
 * al pallet FÍSICO. Dos filas pueden decir "P3" y ser cosas distintas; dos filas con el mismo
 * slot son la misma.
 */
export function accionReclamo(filas: ConSlot[], slotId: number): AccionReclamo {
  return filas.some(f => f.pickingSlotId === slotId) ? 'ya_visible' : 'agregar';
}

/** El aviso cuando el pallet ya estaba a la vista. */
export function avisoYaVisible(slotId: number): string {
  return `El pallet #${slotId} ya está en la lista de esta tienda.`;
}

/** El aviso cuando el pallet estaba en la carga pero faltaba en pantalla. */
export function avisoRecuperado(slotId: number): string {
  return `✓ Pallet #${slotId} recuperado — ya estaba en la carga de hoy y faltaba en la lista.`;
}
