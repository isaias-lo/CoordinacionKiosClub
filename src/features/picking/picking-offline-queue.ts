/**
 * Cola offline para operaciones de picking que fallaron por falta de red.
 * Adoptado del patrón de auditoría (AuditoriaScreen.tsx:62-79).
 *
 * Operaciones soportadas:
 *  - add:    Agregar un slot de pallet (POST /api/picking-pallets)
 *  - print:  Registrar una impresión  (POST /api/picking-prints)
 *
 * La cola se persiste en localStorage. Se flushea cuando el usuario reconecta.
 */

export type OfflineQueueItem =
  | {
      op: 'add';
      stateKey: string; storeCod: string; pickerLabel: string;
      tipo: string; contenido: string; refs: string; date: string;
    }
  | {
      op: 'print';
      stateKey: string; pickerLabel: string; pallets: number;
      tipo: string; date: string; printedByName: string; batch?: string;
    };

const QUEUE_KEY = 'picking_offline_queue_v1';

export function loadPickingQueue(): OfflineQueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as OfflineQueueItem[]; }
  catch { return []; }
}

export function savePickingQueue(q: OfflineQueueItem[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
  catch { /* storage full */ }
}

export function enqueuePickingItem(item: OfflineQueueItem): void {
  const q = loadPickingQueue();
  q.push(item);
  savePickingQueue(q);
}

/**
 * Intenta enviar todos los ítems de la cola en orden.
 * Los que fallan de nuevo se mantienen en la cola.
 * Retorna el número de ítems enviados exitosamente.
 */
export async function flushPickingQueue(
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  onFlushed: (count: number) => void,
): Promise<void> {
  const q = loadPickingQueue();
  if (q.length === 0) return;

  const remaining: OfflineQueueItem[] = [];
  let flushed = 0;

  for (const item of q) {
    try {
      let res: Response;
      if (item.op === 'add') {
        res = await authedFetch('/api/picking-pallets', {
          method: 'POST',
          body: JSON.stringify({
            date: item.date, store_cod: item.storeCod, state_key: item.stateKey,
            picker_label: item.pickerLabel, tipo: item.tipo,
            contenido: item.contenido, refs: item.refs,
          }),
        });
      } else {
        res = await authedFetch('/api/picking-prints', {
          method: 'POST',
          body: JSON.stringify({
            stateKey: item.stateKey, pickerLabel: item.pickerLabel,
            pallets: item.pallets, tipo: item.tipo, date: item.date,
            printedByName: item.printedByName, batch: item.batch ?? '',
          }),
        });
      }
      if (res.ok) { flushed++; }
      else { remaining.push(item); }
    } catch {
      remaining.push(item);
    }
  }

  savePickingQueue(remaining);
  if (flushed > 0) onFlushed(flushed);
}
