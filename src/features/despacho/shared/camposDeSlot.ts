// Llenar la fila de Bodega con lo que el slot de Picking ya sabe. Puro y testeable.
//
// Al reclamar un pallet PREEXISTENTE, el formulario creaba una fila VACÍA y solo le pegaba el
// `pickingSlotId`. El peso y las medidas que el slot traía se descartaban.
//
// Eso contradice de frente lo que promete el propio diálogo al restaurar:
//
//     «Vuelve el pallet (485 kg) tal como estaba al borrarse, con su mismo número y etiqueta»
//
// La fila de la base SÍ vuelve con sus 485 kg — el restaurador copia peso_kg, alto, largo y ancho.
// Lo que no volvía era la pantalla: aparecía una tarjeta en blanco y había que pesar y medir de
// nuevo un pallet que ya estaba pesado y medido. Un pallet recuperado que se ve vacío se lee como
// "no funcionó", que es justo lo que se reportó.

export interface SlotConMedidas {
  contenido?: string | null;
  peso_kg?: number | string | null;
  alto?: number | string | null;
  largo?: number | string | null;
  ancho?: number | string | null;
}

/** Los campos del formulario son texto. Un 0 o un null son "sin medir": van vacíos, no "0". */
function aTexto(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '';
  // Sin decimales de más: 485 se escribe "485", no "485.0"; 12.5 conserva su coma.
  return String(n).replace('.', ',');
}

export interface CamposDeSlot {
  peso: string; alto: string; largo: string; ancho: string;
}

/**
 * Peso y medidas del slot, listos para la fila del formulario.
 *
 * Lo que no esté medido queda vacío a propósito: un "0" parece un dato y hace que el pallet pase
 * el guardado como si estuviera pesado. Vacío es lo que obliga a completarlo.
 */
export function camposDeSlot(slot: SlotConMedidas | null | undefined): CamposDeSlot {
  return {
    peso:  aTexto(slot?.peso_kg),
    alto:  aTexto(slot?.alto),
    largo: aTexto(slot?.largo),
    ancho: aTexto(slot?.ancho),
  };
}

/** `true` si el slot trae algo que mostrar — para avisar cuando vuelve realmente vacío. */
export function slotTraeDatos(slot: SlotConMedidas | null | undefined): boolean {
  const c = camposDeSlot(slot);
  return !!(c.peso || c.alto || c.largo || c.ancho);
}
