// Cómo se lee el uso de una tienda en la columna Uso de Config. Tiendas. Puro y testeable.
//
// El uso decide si una tienda se puede BORRAR de verdad: una con despachos, picking o manifiestos
// dejaría esas filas apuntando a una ficha que ya no existe (solo `trazabilidad_unidades` tiene
// llave foránea, y es ON DELETE SET NULL: pierde el vínculo en silencio).
//
// La regla que este módulo existe para no romper: **no tener el dato NO es "sin uso"**. Si la
// consulta falla, la columna dice "—" y la tienda no se ofrece como borrable. La duda se resuelve
// del lado seguro, que acá es no borrar.

/** Lo que devuelve `/api/tiendas/uso` por tienda. */
export interface UsoTienda {
  /** Filas en picking + despacho RM + despacho Regiones + manifiestos + sesión. */
  total: number;
  /** Su código aparece dentro del calendario (que es un solo bloque JSON). */
  enCalendario: boolean;
  /** Solo si no dejó rastro en ningún lado NI está en el calendario. */
  puedeEliminar: boolean;
}

export interface EtiquetaUso {
  /** Lo que se muestra en la celda. */
  texto: string;
  /** Si esta tienda se puede borrar de verdad. */
  borrable: boolean;
  /** Si hay dato. En false, `texto` es "—" y no se afirma nada. */
  conocido: boolean;
}

/**
 * La etiqueta de la celda Uso.
 *
 * Cuatro casos, y el orden importa:
 *   · sin dato        → "—"              (no se sabe; NUNCA se asume que está limpia)
 *   · borrable        → "sin uso"
 *   · 0 pero agendada → "en calendario"  (no dejó filas, pero el calendario la nombra: decir "0"
 *                                         invitaría a borrar algo que el día de despacho va a pedir)
 *   · con historial   → el número
 */
export function etiquetaDeUso(uso: UsoTienda | undefined | null): EtiquetaUso {
  if (!uso) return { texto: '—', borrable: false, conocido: false };
  if (uso.puedeEliminar) return { texto: 'sin uso', borrable: true, conocido: true };
  if (uso.total === 0 && uso.enCalendario) return { texto: 'en calendario', borrable: false, conocido: true };
  return { texto: String(uso.total), borrable: false, conocido: true };
}

/**
 * Parte una selección en lo que se puede borrar y lo que no.
 *
 * Conserva el orden de la lista para que los códigos se lean igual que en la tabla, y una tienda
 * sin dato de uso cae SIEMPRE del lado de "no se puede": ver el encabezado del módulo.
 */
export function partirPorBorrable<T extends { codigo: string }>(
  tiendas: T[],
  usoPorCod: Record<string, UsoTienda>,
): { borrables: T[]; conHistorial: T[] } {
  const borrables: T[] = [];
  const conHistorial: T[] = [];
  for (const t of tiendas) {
    if (usoPorCod[t.codigo]?.puedeEliminar) borrables.push(t);
    else conHistorial.push(t);
  }
  return { borrables, conHistorial };
}
