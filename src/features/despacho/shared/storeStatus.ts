/**
 * Estado del semáforo de una tienda (punto gris/naranja/verde en bodegas).
 *
 *  - `none`     (gris)    → nada REALIZADO todavía (done = 0), aunque ya existan
 *                           operaciones asignadas/en "Preparado". También si no hay ops.
 *  - `partial`  (naranja) → al menos 1 realizado pero no todas: 1/N … (N-1)/N.
 *  - `complete` (verde)   → todas realizadas (N/N).
 *
 * Regla acordada: el naranja significa "en progreso" (≥1 movimiento realizado). Que las
 * operaciones estén asignadas/preparadas pero con 0 hechas NO basta → queda GRIS.
 */
export type StoreStatus = 'none' | 'partial' | 'complete';

export function computeStoreStatus(total: number, done: number): StoreStatus {
  if (total <= 0 || done <= 0) return 'none';      // sin ops, o asignadas pero 0 realizadas
  if (done >= total)           return 'complete';  // todas realizadas
  return 'partial';                                 // 1..N-1 realizadas
}
