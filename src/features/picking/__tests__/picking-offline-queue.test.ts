// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadPickingQueue,
  savePickingQueue,
  enqueuePickingItem,
  flushPickingQueue,
} from '../picking-offline-queue';
import type { OfflineQueueItem } from '../picking-offline-queue';

const QUEUE_KEY = 'picking_offline_queue_v1';

const ADD_ITEM: OfflineQueueItem = {
  op: 'add',
  stateKey: 'LAS__Picker 1',
  storeCod: 'LAS',
  pickerLabel: 'Picker 1',
  tipo: 'P',
  contenido: 'comida',
  refs: '',
  date: '2025-06-12',
};

const PRINT_ITEM: OfflineQueueItem = {
  op: 'print',
  stateKey: 'LAS__Picker 1',
  pickerLabel: 'Picker 1',
  pallets: 3,
  tipo: 'P',
  date: '2025-06-12',
  printedByName: 'Admin',
};

beforeEach(() => {
  localStorage.clear();
});

// ─── loadPickingQueue ─────────────────────────────────────────────────────────

describe('loadPickingQueue', () => {
  it('returns empty array when localStorage is empty', () => {
    expect(loadPickingQueue()).toEqual([]);
  });

  it('returns parsed items from localStorage', () => {
    localStorage.setItem(QUEUE_KEY, JSON.stringify([ADD_ITEM]));
    expect(loadPickingQueue()).toEqual([ADD_ITEM]);
  });

  it('returns empty array when localStorage contains invalid JSON', () => {
    localStorage.setItem(QUEUE_KEY, 'not-json');
    expect(loadPickingQueue()).toEqual([]);
  });
});

// ─── savePickingQueue ─────────────────────────────────────────────────────────

describe('savePickingQueue', () => {
  it('persists items to localStorage', () => {
    savePickingQueue([ADD_ITEM]);
    const stored = JSON.parse(localStorage.getItem(QUEUE_KEY)!);
    expect(stored).toEqual([ADD_ITEM]);
  });

  it('persists an empty array', () => {
    savePickingQueue([]);
    expect(localStorage.getItem(QUEUE_KEY)).toBe('[]');
  });
});

// ─── enqueuePickingItem ───────────────────────────────────────────────────────

describe('enqueuePickingItem', () => {
  it('appends an item to an empty queue', () => {
    enqueuePickingItem(ADD_ITEM);
    expect(loadPickingQueue()).toEqual([ADD_ITEM]);
  });

  it('appends to an existing queue without losing previous items', () => {
    enqueuePickingItem(ADD_ITEM);
    enqueuePickingItem(PRINT_ITEM);
    const q = loadPickingQueue();
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual(ADD_ITEM);
    expect(q[1]).toEqual(PRINT_ITEM);
  });
});

// ─── flushPickingQueue ────────────────────────────────────────────────────────

describe('flushPickingQueue', () => {
  it('does nothing when the queue is empty', async () => {
    const fetch = vi.fn();
    const onFlushed = vi.fn();
    await flushPickingQueue(fetch, onFlushed);
    expect(fetch).not.toHaveBeenCalled();
    expect(onFlushed).not.toHaveBeenCalled();
  });

  it('removes successful items and calls onFlushed', async () => {
    enqueuePickingItem(ADD_ITEM);
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const onFlushed = vi.fn();

    await flushPickingQueue(fetch, onFlushed);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/picking-pallets', expect.objectContaining({ method: 'POST' }));
    expect(onFlushed).toHaveBeenCalledWith(1);
    expect(loadPickingQueue()).toEqual([]);
  });

  it('keeps failed items in the queue', async () => {
    enqueuePickingItem(ADD_ITEM);
    const fetch = vi.fn().mockResolvedValue({ ok: false });
    const onFlushed = vi.fn();

    await flushPickingQueue(fetch, onFlushed);

    expect(onFlushed).not.toHaveBeenCalled();
    expect(loadPickingQueue()).toEqual([ADD_ITEM]);
  });

  it('keeps items that throw (network error)', async () => {
    enqueuePickingItem(ADD_ITEM);
    const fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    const onFlushed = vi.fn();

    await flushPickingQueue(fetch, onFlushed);

    expect(onFlushed).not.toHaveBeenCalled();
    expect(loadPickingQueue()).toEqual([ADD_ITEM]);
  });

  it('processes print items via /api/picking-prints', async () => {
    enqueuePickingItem(PRINT_ITEM);
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    const onFlushed = vi.fn();

    await flushPickingQueue(fetch, onFlushed);

    expect(fetch).toHaveBeenCalledWith('/api/picking-prints', expect.objectContaining({ method: 'POST' }));
    expect(onFlushed).toHaveBeenCalledWith(1);
  });

  it('flushes some items and keeps others on mixed results', async () => {
    enqueuePickingItem(ADD_ITEM);
    enqueuePickingItem(PRINT_ITEM);

    // First call succeeds, second fails
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });
    const onFlushed = vi.fn();

    await flushPickingQueue(fetch, onFlushed);

    expect(onFlushed).toHaveBeenCalledWith(1);
    expect(loadPickingQueue()).toEqual([PRINT_ITEM]);
  });
});
