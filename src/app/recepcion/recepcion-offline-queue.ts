/**
 * Cola offline para recepciones de tienda que no se pudieron enviar por falta de red.
 * Mismo patrón que `src/features/picking/picking-offline-queue.ts`.
 *
 * Cada ítem lleva un `clientOpId` → el servidor deduplica por él (columna client_op_id),
 * así un reintento (flush al reconectar) NUNCA crea un duplicado. El body es el mismo POST
 * que /api/recepcion (incluye OTP, fotos como data URLs, etc.).
 */

export interface RecepcionQueueItem {
  clientOpId: string;
  body: Record<string, unknown>;
  ts: number;
}

const QUEUE_KEY = 'recepcion_offline_queue_v1';

/** Agrega un ítem evitando duplicar el mismo clientOpId. Puro y testeable. */
export function enqueueDedup(queue: RecepcionQueueItem[], item: RecepcionQueueItem): RecepcionQueueItem[] {
  if (queue.some(q => q.clientOpId === item.clientOpId)) return queue;
  return [...queue, item];
}

export function loadRecepcionQueue(): RecepcionQueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as RecepcionQueueItem[]; }
  catch { return []; }
}

export function saveRecepcionQueue(q: RecepcionQueueItem[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch { /* storage lleno (fotos grandes): se descarta el guardado, el envío directo sigue su curso */ }
}

export function enqueueRecepcion(item: RecepcionQueueItem): void {
  saveRecepcionQueue(enqueueDedup(loadRecepcionQueue(), item));
}

export function hasPendingRecepciones(): boolean {
  return loadRecepcionQueue().length > 0;
}

/**
 * Intenta enviar todos los ítems en orden. Los que fallan se mantienen.
 * Retorna cuántos se enviaron. La idempotencia (clientOpId) hace inofensivo el reintento.
 */
export async function flushRecepcionQueue(onFlushed?: (count: number) => void): Promise<number> {
  const q = loadRecepcionQueue();
  if (q.length === 0) return 0;

  const remaining: RecepcionQueueItem[] = [];
  let flushed = 0;

  for (const item of q) {
    try {
      const res = await fetch('/api/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      if (res.ok) flushed++;
      else remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }

  saveRecepcionQueue(remaining);
  if (flushed > 0) onFlushed?.(flushed);
  return flushed;
}
