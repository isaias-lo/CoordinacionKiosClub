// Orden visual de las cards de bodega por tipo de envase: Pallet → Contenedor → Bulto → Chocolate.
// Puro y testeable. Sort ESTABLE: mantiene el orden de llegada (de Picking) dentro de cada tipo.
// Cubre los dos nombres de tipo del sistema: Santiago (Pallet/Bulto/Contenedor/Chocolate) y
// Regiones (pallet/box/contenedor/chocolate).

const PRIORIDAD: Record<string, number> = {
  pallet: 0, Pallet: 0, P: 0,
  contenedor: 1, Contenedor: 1, C: 1,
  box: 2, Bulto: 2, bulto: 2, B: 2,
  chocolate: 3, Chocolate: 3, CH: 3,
};

/** Prioridad de orden de un tipo de card. Tipos desconocidos van al final. */
export function prioridadTipoCard(kind: string): number {
  return PRIORIDAD[kind] ?? 99;
}

/**
 * Ordena filas por tipo (Pallet → Contenedor → Bulto → Chocolate), de forma ESTABLE.
 * `kindOf` extrae el tipo de cada fila (p. ej. `r => r.tipo` en Santiago, `r => r.pkg` en Regiones).
 */
export function ordenarCardsPorTipo<T>(rows: T[], kindOf: (r: T) => string): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (prioridadTipoCard(kindOf(a.r)) - prioridadTipoCard(kindOf(b.r))) || (a.i - b.i))
    .map(x => x.r);
}
