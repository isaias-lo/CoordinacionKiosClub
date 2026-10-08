// Cuándo la tarjeta «Sin asignar» se muestra. Puro y testeable.
//
// Las operaciones de Odoo sin responsable se juntan en un encargado «Sin asignar». Su tarjeta se
// veía como la de cualquier encargado, con campo de nombre y contadores, mientras el aviso rojo de
// la tienda decía que no genera etiqueta. Ahora el aviso es lo único que se ve… salvo que ese grupo
// ya tenga unidades guardadas: esas tienen que seguir a la vista para poder quitarlas.

import type { PickerGroup, PalletSlot } from './picking-types';

export function ocultarSinAsignar(group: Pick<PickerGroup, 'key'>, slots: readonly PalletSlot[] | undefined): boolean {
  return group.key === 'Sin asignar' && (slots?.length ?? 0) === 0;
}
