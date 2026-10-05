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
