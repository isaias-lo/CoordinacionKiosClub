/**
 * Estado del semáforo de una tienda (punto gris/naranja/verde en bodegas).
 *
 *  - `none`     (gris)    → SIN operaciones asignadas a un picker (nada que pickear).
 *  - `partial`  (naranja) → asignado pero NO terminado. Incluye 0/N, 1/N … (N-1)/N.
 *  - `complete` (verde)   → todas las operaciones asignadas terminadas (N/N).
 *
 * Regla: el gris representa "sin asignación". Apenas hay operaciones asignadas
 * (total > 0) el punto pasa a naranja aunque no se haya hecho ninguna (0/N), y a
 * verde solo cuando están todas (done >= total).
 */
export type StoreStatus = 'none' | 'partial' | 'complete';

export function computeStoreStatus(total: number, done: number): StoreStatus {
  if (total <= 0)    return 'none';      // sin operaciones asignadas
  if (done >= total) return 'complete';  // todo lo asignado, terminado
  return 'partial';                       // asignado pero incompleto (incluye 0/N)
}
