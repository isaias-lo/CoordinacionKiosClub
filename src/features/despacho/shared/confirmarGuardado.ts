// Lo guardado queda bloqueado: para cambiarlo hay que confirmar. Pedido de Isaias (5 oct 2026),
// para que un toque de más en Editar o Eliminar no deshaga un pallet ya pesado. Bodega la usan
// solo asistentes de despacho y admin, así que no se distingue por rol.

export type CambioGuardado = 'editar' | 'eliminar';

/** El texto del aviso. Puro, para poder probarlo. */
export function textoConfirmacion(accion: CambioGuardado, etiqueta: string): string {
  return accion === 'editar'
    ? `${etiqueta} ya está guardado.\n\n¿Seguro que quieres editarlo?`
    : `${etiqueta} ya está guardado.\n\n¿Seguro que quieres eliminarlo?`;
}

/** El aviso al eliminar varios de una vez desde la barra de seleccionados. */
export function textoEliminarVarios(n: number): string {
  return n === 1
    ? '¿Seguro que quieres eliminar el seleccionado?'
    : `¿Seguro que quieres eliminar los ${n} seleccionados?`;
}

export function confirmarCambioGuardado(accion: CambioGuardado, etiqueta: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.confirm(textoConfirmacion(accion, etiqueta));
}

export function confirmarEliminarVarios(n: number): boolean {
  if (typeof window === 'undefined' || n <= 0) return false;
  return window.confirm(textoEliminarVarios(n));
}

/**
 * La ✕ de una tarjeta sin guardar. No solo la saca de la pantalla: BORRA su pallet de Picking, que
 * ya tiene la etiqueta impresa. Era un botón de 37 px en la esquina de la tarjeta que se está
 * pesando, sin confirmar ni deshacer. Una tarjeta sin pallet de Picking (recién agregada a mano y
 * sin crear todavía) no tiene nada que perder y se quita sin preguntar.
 */
export function textoQuitarSinGuardar(etiqueta: string): string {
  return `¿Quitar ${etiqueta}?\n\nSe borra también de Picking, y su etiqueta ya está impresa.`;
}

export function confirmarQuitarSinGuardar(etiqueta: string, tieneSlot: boolean): boolean {
  if (!tieneSlot) return true;
  if (typeof window === 'undefined') return false;
  return window.confirm(textoQuitarSinGuardar(etiqueta));
}
