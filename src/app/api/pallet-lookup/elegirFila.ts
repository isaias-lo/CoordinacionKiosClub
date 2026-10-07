// Cuál de las dos tablas de despacho manda cuando el id está en las dos. PURO.
//
// ── POR QUÉ HACE FALTA ELEGIR ─────────────────────────────────────────────────────────────────
//
// `pallet-lookup` precarga el formulario de Recepción y el del conductor. Buscaba en `despacho_rm`
// PRIMERO y se quedaba con lo que encontrara. Pero Picking escribe un BORRADOR al crear el slot
// —sin conductor, sin ruta, sin peso, con `estado: 'En picking'`—, y hasta el #684 lo escribía
// siempre en `despacho_rm`, también para las tiendas de Región.
//
// Medido el 07/10/2026: **95 ids viven en las dos tablas, y en 82 la fila de RM está vacía
// mientras la de Nacional tiene el peso.** Ejemplo real, `P447PTV01102026P`:
//
//     despacho_rm        47PTV         · RM · sin peso · fuente 'picking'
//     despacho_regiones  Puerto Varas  · 216 kg · patente VXSX43
//
// O sea que escanear el QR de un pallet de Región abría el formulario con el CÓDIGO en vez del
// nombre y sin conductor ni ruta.
//
// ── LA REGLA ──────────────────────────────────────────────────────────────────────────────────
//
// Un borrador de Picking nunca le gana a una fila de Bodega o del Enrutador. No es una
// preferencia de tabla: es que una fila que todavía no tiene los datos no puede tapar a la que sí.
//
// Esto arregla además las 82 filas que YA existen, sin migrar nada.

/** Lo mínimo para decidir. */
export interface FilaElegible { fuente?: string | null }

/** `true` si la fila es el borrador que escribe Picking al crear el slot. */
export function esBorradorDePicking(fila: FilaElegible | null | undefined): boolean {
  return String(fila?.fuente ?? '').trim().toLowerCase() === 'picking';
}

/**
 * La fila que manda, y de qué tabla salió.
 *
 * Si las dos son borradores, o las dos son reales, gana `despacho_rm` — que es el orden de
 * siempre, y acá no hay con qué desempatar mejor.
 */
export function elegirFilaDeDespacho<T extends FilaElegible>(
  rm: T | null | undefined,
  regiones: T | null | undefined,
): { fila: T; tabla: 'despacho_rm' | 'despacho_regiones' } | null {
  if (rm && regiones && esBorradorDePicking(rm) && !esBorradorDePicking(regiones)) {
    return { fila: regiones, tabla: 'despacho_regiones' };
  }
  if (rm) return { fila: rm, tabla: 'despacho_rm' };
  if (regiones) return { fila: regiones, tabla: 'despacho_regiones' };
  return null;
}
