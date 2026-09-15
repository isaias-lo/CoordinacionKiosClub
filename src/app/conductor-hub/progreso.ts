/**
 * [Panel Conductor · Fase 1] Lógica pura del progreso de una ruta — separada de `page.tsx` (que
 * es 'use client' y depende de fetch/localStorage) para poder testearla sin montar el componente,
 * mismo patrón que el resto del repo (funciones puras junto a su `__tests__`).
 */

export interface ParadaProgreso {
  id: number;
  orden: number;
  estado_entrega: string;
}

/** Cuántas paradas de la ruta ya se entregaron, para el contador "4/7 paradas" de la tarjeta. */
export function progresoRuta(paradas: ParadaProgreso[]): { entregadas: number; total: number } {
  return {
    entregadas: paradas.filter(p => p.estado_entrega === 'entregado').length,
    total: paradas.length,
  };
}

/**
 * La próxima parada pendiente en el ORDEN de la ruta (no el orden en que llegan del server) — o
 * `null` si ya se entregaron todas. Se resalta en la lista para que el chofer no tenga que
 * buscarla entre las ya entregadas.
 */
export function proximaParadaPendiente<T extends ParadaProgreso>(paradas: T[]): T | null {
  return [...paradas].sort((a, b) => a.orden - b.orden).find(p => p.estado_entrega !== 'entregado') ?? null;
}
