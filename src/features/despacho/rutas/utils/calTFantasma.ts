/**
 * Detecta un "fantasma" en el pool del Enrutador: un código que NO está en el catálogo
 * (tiendas) Y que no tiene cantidades (p/b/ch = 0).
 *
 * Origen típico: un código tecleado por error que quedó persistido en localStorage
 * (p. ej. "ALC" en vez de "26ALC"). No sirve para rutear (sin cantidades) ni es una tienda
 * real (fuera de catálogo) → se oculta de la lista para no confundir.
 *
 * Puro y testeable. NO borra nada: solo decide si mostrar la fila.
 */
export function esFantasmaCalT(
  data: { p?: number; b?: number; ch?: number } | undefined,
  enCatalogo: boolean,
): boolean {
  if (!data) return true;          // sin datos → nada que mostrar
  if (enCatalogo) return false;    // tienda real del catálogo → nunca es fantasma
  return (data.p || 0) === 0 && (data.b || 0) === 0 && (data.ch || 0) === 0;
}
