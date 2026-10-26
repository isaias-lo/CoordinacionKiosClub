// Lo guardado queda bloqueado: para cambiarlo hay que confirmar. Pedido de Isaias (5 oct 2026),
// para que un toque de más en Editar o Eliminar no deshaga un pallet ya pesado. Bodega la usan
// solo asistentes de despacho y admin, así que no se distingue por rol.

//
// Desde el 22/10/2026 pregunta con el aviso de la app (`confirmar`), no con el del navegador: cada
// pregunta es un `PedidoConfirmacion` armado acá (puro, se prueba) y las funciones son async.

import { confirmar, type PedidoConfirmacion } from './confirmar';

export type CambioGuardado = 'editar' | 'eliminar';

/** El aviso al eliminar varios de una vez desde la barra de seleccionados. */
export function textoEliminarVarios(n: number): string {
  return n === 1
    ? '¿Seguro que quieres eliminar el seleccionado?'
    : `¿Seguro que quieres eliminar los ${n} seleccionados?`;
}

/** La pregunta antes de tocar algo guardado. El botón dice qué hace: «Editar P3», «Eliminar P3». */
export function pedidoCambioGuardado(accion: CambioGuardado, etiqueta: string): PedidoConfirmacion {
  return accion === 'editar'
    ? { titulo: `¿Editar ${etiqueta}?`, detalle: `${etiqueta} ya está guardado.`, aceptar: `Editar ${etiqueta}` }
    : { titulo: `¿Eliminar ${etiqueta}?`, detalle: `${etiqueta} ya está guardado.`,
        aceptar: `Eliminar ${etiqueta}`, tono: 'peligro' };
}

export function confirmarCambioGuardado(accion: CambioGuardado, etiqueta: string): Promise<boolean> {
  return confirmar(pedidoCambioGuardado(accion, etiqueta));
}

export function confirmarEliminarVarios(n: number): Promise<boolean> {
  if (n <= 0) return Promise.resolve(false);
  return confirmar({ titulo: textoEliminarVarios(n), aceptar: 'Eliminar', tono: 'peligro' });
}

/**
 * La ✕ de una tarjeta sin guardar. No solo la saca de la pantalla: BORRA su pallet de Picking, que
 * ya tiene la etiqueta impresa. Era un botón de 37 px en la esquina de la tarjeta que se está
 * pesando, sin confirmar ni deshacer. Una tarjeta sin pallet de Picking (recién agregada a mano y
 * sin crear todavía) no tiene nada que perder y se quita sin preguntar.
 */
export function pedidoQuitarSinGuardar(etiqueta: string): PedidoConfirmacion {
  return { titulo: `¿Quitar ${etiqueta}?`, detalle: 'Se borra también de Picking, y su etiqueta ya está impresa.',
    aceptar: `Quitar ${etiqueta}`, tono: 'peligro' };
}

export function confirmarQuitarSinGuardar(etiqueta: string, tieneSlot: boolean): Promise<boolean> {
  if (!tieneSlot) return Promise.resolve(true);
  return confirmar(pedidoQuitarSinGuardar(etiqueta));
}

// ── Las otras preguntas de Bodega, iguales en RM/Costa y Nacional ──────────────────────────────

/** Guardar con peso 0. */
export const PEDIDO_SIN_PESAR: PedidoConfirmacion = {
  titulo: '¿Agregar sin pesar?', detalle: 'El peso y las medidas quedarán en 0.',
  aceptar: 'Agregar sin pesar', tono: 'aviso',
};

/** Reabrir una tienda terminada. */
export const PEDIDO_REABRIR_TIENDA: PedidoConfirmacion = {
  titulo: '¿Reabrir esta tienda?', detalle: 'Ya no se mostrará como lista para despachar.',
  aceptar: 'Reabrir',
};

/** Un peso que no da (ver `avisoDePeso`). Cancelar se llama «Corregir»: es lo que hay que hacer. */
export function pedidoPesoRaro(aviso: { titulo: string; detalle: string }): PedidoConfirmacion {
  return { titulo: aviso.titulo, detalle: aviso.detalle, aceptar: 'Guardar así', cancelar: 'Corregir', tono: 'aviso' };
}

/** Registrar el día con algo sin cerrar (ver `avisoAntesDeRegistrar`). */
export function pedidoRegistrarIgual(aviso: string): PedidoConfirmacion {
  return { titulo: '¿Registrar igual?', detalle: aviso, aceptar: 'Registrar igual', tono: 'aviso' };
}

/** Marcar una tienda terminada. `avisos` son las líneas de lo que falta, si falta algo. */
export function pedidoTerminarTienda(avisos: readonly string[]): PedidoConfirmacion {
  const pie = 'En el Enrutador va a poder asignarse a un camión: solo hazlo si ya no le vas a agregar más carga.';
  return {
    titulo: '¿Marcar esta tienda como terminada?',
    detalle: avisos.length ? `${avisos.join('\n')}\n\n${pie}` : pie,
    aceptar: 'Terminar tienda', tono: avisos.length ? 'aviso' : 'normal',
  };
}
