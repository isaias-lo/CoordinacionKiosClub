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

/** Una parada ya está "resuelta" — entregada O con un intento fallido registrado (Fase 6) — y
 *  por eso deja de ser la "próxima" y deja de contar como pendiente en el progreso. Antes solo
 *  existía 'entregado'; sin esto, una parada marcada "no se pudo entregar" habría seguido
 *  apareciendo como "Siguiente" para siempre, como si nadie hubiera pasado por ahí. */
function estaResuelta(estado: string): boolean {
  return estado === 'entregado' || estado === 'no_entregado';
}

/** Cuántas paradas de la ruta ya se entregaron (con éxito) y cuántas no se pudieron entregar —
 *  separadas, no sumadas: "4 entregadas, 1 no entregada" es más honesto que un solo número que
 *  esconde un fallo detrás de un éxito. */
export function progresoRuta(paradas: ParadaProgreso[]): { entregadas: number; noEntregadas: number; total: number } {
  return {
    entregadas:   paradas.filter(p => p.estado_entrega === 'entregado').length,
    noEntregadas: paradas.filter(p => p.estado_entrega === 'no_entregado').length,
    total: paradas.length,
  };
}

/**
 * La próxima parada pendiente en el ORDEN de la ruta (no el orden en que llegan del server) — o
 * `null` si ya se resolvieron todas (entregadas o no-entregadas). Se resalta en la lista para que
 * el chofer no tenga que buscarla entre las ya resueltas.
 */
export function proximaParadaPendiente<T extends ParadaProgreso>(paradas: T[]): T | null {
  return [...paradas].sort((a, b) => a.orden - b.orden).find(p => !estaResuelta(p.estado_entrega)) ?? null;
}
