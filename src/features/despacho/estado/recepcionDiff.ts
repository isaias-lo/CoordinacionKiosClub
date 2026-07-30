/**
 * Diferencia entre lo ENVIADO y lo RECIBIDO de una fila de recepción.
 * Pura y testeable — la usan tanto la columna "Diferencias" de la tabla como el
 * badge del modal de detalle. Antes la comparación vivía inline en el modal
 * (solo pallets+bultos); acá incluye también contenedores.
 */

export interface DiffResumen {
  hayDiferencia: boolean;
  /** Detalle por línea que difiere, ej. ["P: 2→4", "B: 0→1"]. Vacío si todo coincide. */
  detalles: string[];
}

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export function resumenDiferencia(row: {
  pallets_sent?: unknown;      pallets_recibidos?: unknown;
  bultos_sent?: unknown;       bultos_recibidos?: unknown;
  contenedores_sent?: unknown; contenedores_recibidos?: unknown;
}): DiffResumen {
  const items: [string, number, number][] = [
    ['P', n(row.pallets_sent),      n(row.pallets_recibidos)],
    ['B', n(row.bultos_sent),       n(row.bultos_recibidos)],
    ['C', n(row.contenedores_sent), n(row.contenedores_recibidos)],
  ];
  const detalles = items
    .filter(([, sent, rec]) => sent !== rec)
    .map(([label, sent, rec]) => `${label}: ${sent}→${rec}`);
  return { hayDiferencia: detalles.length > 0, detalles };
}
