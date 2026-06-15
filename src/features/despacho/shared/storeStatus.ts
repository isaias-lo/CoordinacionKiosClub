/**
 * Estado del semáforo de una tienda (punto gris/naranja/verde en bodegas).
 *
 *  - `none`     (gris)    → nada terminado todavía (o sin operaciones).
 *  - `partial`  (naranja) → algunas operaciones terminadas, pero no todas.
 *  - `complete` (verde)   → todas las operaciones terminadas.
 *
 * Regla acordada: si `done === 0` el punto queda GRIS aunque ya existan
 * operaciones en Odoo (no naranja). Naranja solo cuando hay progreso real.
 */
export type StoreStatus = 'none' | 'partial' | 'complete';

export function computeStoreStatus(total: number, done: number): StoreStatus {
  if (total <= 0 || done <= 0) return 'none';
  if (done >= total)           return 'complete';
  return 'partial';
}
