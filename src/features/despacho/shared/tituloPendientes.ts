// La línea del aviso plegado de despachos sin registrar. Pura y testeable.

/**
 * «Despacho sin registrar · 15 oct 2026», o con varios «2 despachos sin registrar · 15 oct 2026 y
 * 9 oct 2026». Plegado, es lo único que se ve: tiene que decir cuántos y de qué días.
 */
export function tituloPendientes(fechas: readonly string[]): string {
  if (fechas.length === 0) return '';
  if (fechas.length === 1) return `Despacho sin registrar · ${fechas[0]}`;
  const lista = fechas.length === 2
    ? `${fechas[0]} y ${fechas[1]}`
    : `${fechas.slice(0, -1).join(', ')} y ${fechas[fechas.length - 1]}`;
  return `${fechas.length} despachos sin registrar · ${lista}`;
}
