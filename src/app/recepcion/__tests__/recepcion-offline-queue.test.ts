import { describe, it, expect } from 'vitest';
import { enqueueDedup, type RecepcionQueueItem } from '../recepcion-offline-queue';

const item = (clientOpId: string): RecepcionQueueItem => ({ clientOpId, body: { cod: '37MAI' }, ts: 1 });

describe('enqueueDedup', () => {
  it('agrega un ítem nuevo', () => {
    const q = enqueueDedup([], item('a'));
    expect(q).toHaveLength(1);
    expect(q[0].clientOpId).toBe('a');
  });

  it('NO duplica el mismo clientOpId (idempotencia de la cola)', () => {
    const q1 = enqueueDedup([], item('a'));
    const q2 = enqueueDedup(q1, item('a'));
    expect(q2).toHaveLength(1);
  });

  it('conserva el orden al agregar ítems distintos', () => {
    let q: RecepcionQueueItem[] = [];
    q = enqueueDedup(q, item('a'));
    q = enqueueDedup(q, item('b'));
    expect(q.map(i => i.clientOpId)).toEqual(['a', 'b']);
  });

  it('no muta la cola original', () => {
    const orig: RecepcionQueueItem[] = [];
    enqueueDedup(orig, item('a'));
    expect(orig).toHaveLength(0);
  });
});
