// @vitest-environment jsdom
//
// jsdom no trae IndexedDB, así que estas pruebas corren sobre el RESPALDO en localStorage de la
// cola única — que es justo el camino que hay que proteger: es el que mantiene a picking igual de
// capaz que antes en un navegador con IndexedDB bloqueado.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadPickingQueue,
  enqueuePickingItem,
  flushPickingQueue,
  migrarColaVieja,
  bloqueadasPicking,
  contarPendientesPicking,
} from '../picking-offline-queue';
import type { OfflineQueueItem } from '../picking-offline-queue';

const CLAVE_VIEJA = 'picking_offline_queue_v1';

const ADD_ITEM: OfflineQueueItem = {
  op: 'add',
  stateKey: 'LAS__Picker 1',
  storeCod: 'LAS',
  pickerLabel: 'Picker 1',
  tipo: 'P',
  contenido: 'comida',
  refs: '',
  date: '2025-06-12',
  clientOpId: 'op-add-1',
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

const ok       = () => Promise.resolve(new Response('{}', { status: 200 }));
const rechazo  = () => Promise.resolve(new Response('{}', { status: 403 }));
const caido    = () => Promise.resolve(new Response('{}', { status: 503 }));
const sinRed   = () => Promise.reject(new Error('Failed to fetch'));

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('encolar y leer', () => {
  it('guarda y devuelve lo encolado', async () => {
    await enqueuePickingItem(ADD_ITEM);
    const q = await loadPickingQueue();
    expect(q).toHaveLength(1);
    expect(q[0].payload).toEqual(ADD_ITEM);
    expect(q[0].modulo).toBe('picking');
  });

  it('conserva el clientOpId del primer intento online, que es lo que evita el duplicado', async () => {
    // Si la petición sí llegó y lo que se perdió fue la respuesta, el reenvío tiene que repetir el
    // mismo id para que el servidor lo reconozca en vez de crear un segundo pallet.
    await enqueuePickingItem(ADD_ITEM);
    expect((await loadPickingQueue())[0].clientOpId).toBe('op-add-1');
  });

  it('una impresión también conserva el id de su intento online', async () => {
    // Si el POST de la impresión llegó y se perdió la respuesta, el reenvío con el mismo id no
    // la cuenta como reimpresión (ver sql/2026-10-08_picking_prints_idempotencia.sql).
    await enqueuePickingItem({ ...PRINT_ITEM, clientOpId: 'op-print-1' });
    expect((await loadPickingQueue())[0].clientOpId).toBe('op-print-1');
  });

  it('le da un clientOpId propio a lo que no trae uno', async () => {
    await enqueuePickingItem(PRINT_ITEM);
    expect((await loadPickingQueue())[0].clientOpId).toBeTruthy();
  });

  it('respeta el orden de encolado', async () => {
    // Una impresión se refiere a los pallets agregados antes que ella; al revés registraría una
    // impresión de pallets que todavía no existen.
    await enqueuePickingItem(ADD_ITEM);
    await enqueuePickingItem(PRINT_ITEM);
    const q = await loadPickingQueue();
    expect(q.map(i => i.payload.op)).toEqual(['add', 'print']);
  });

  it('cuenta lo pendiente', async () => {
    await enqueuePickingItem(ADD_ITEM);
    await enqueuePickingItem(PRINT_ITEM);
    expect(await contarPendientesPicking()).toBe(2);
  });
});

describe('flushPickingQueue', () => {
  it('no hace nada con la cola vacía', async () => {
    const fetch = vi.fn(ok);
    const onFlushed = vi.fn();
    await flushPickingQueue(fetch, onFlushed);
    expect(fetch).not.toHaveBeenCalled();
    expect(onFlushed).not.toHaveBeenCalled();
  });

  it('envía y vacía cuando el servidor acepta', async () => {
    await enqueuePickingItem(ADD_ITEM);
    const fetch = vi.fn(ok);
    const onFlushed = vi.fn();
    await flushPickingQueue(fetch, onFlushed);
    expect(fetch).toHaveBeenCalledWith('/api/picking-pallets', expect.objectContaining({ method: 'POST' }));
    expect(onFlushed).toHaveBeenCalledWith(1);
    expect(await loadPickingQueue()).toEqual([]);
  });

  it('manda el clientOpId como client_op_id', async () => {
    await enqueuePickingItem(ADD_ITEM);
    const fetch = vi.fn((_url: string, _init?: RequestInit) => ok());
    await flushPickingQueue(fetch, vi.fn());
    const body = JSON.parse(fetch.mock.calls[0]?.[1]?.body as string);
    expect(body.client_op_id).toBe('op-add-1');
  });

  it('conserva lo que falló sin señal', async () => {
    await enqueuePickingItem(ADD_ITEM);
    const onFlushed = vi.fn();
    await flushPickingQueue(vi.fn(sinRed), onFlushed);
    expect(onFlushed).not.toHaveBeenCalled();
    const q = await loadPickingQueue();
    expect(q).toHaveLength(1);
    expect(q[0].intentos).toBe(1);
    expect(q[0].bloqueado).toBeUndefined();
  });

  it('conserva lo que falló por un servidor caído', async () => {
    await enqueuePickingItem(ADD_ITEM);
    await flushPickingQueue(vi.fn(caido), vi.fn());
    const q = await loadPickingQueue();
    expect(q).toHaveLength(1);
    expect(q[0].bloqueado).toBeUndefined();
  });

  it('marca como bloqueado lo que el servidor rechaza, y avisa', async () => {
    await enqueuePickingItem(ADD_ITEM);
    const onBloqueadas = vi.fn();
    await flushPickingQueue(vi.fn(rechazo), vi.fn(), onBloqueadas);
    expect(onBloqueadas).toHaveBeenCalledWith(1);
    expect(await bloqueadasPicking()).toHaveLength(1);
  });

  it('no reintenta lo ya bloqueado', async () => {
    // Antes esto se reintentaba para siempre, en silencio, mientras la persona lo veía registrado.
    await enqueuePickingItem(ADD_ITEM);
    await flushPickingQueue(vi.fn(rechazo), vi.fn());
    const fetch = vi.fn(ok);
    await flushPickingQueue(fetch, vi.fn());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('envía en orden y sigue con los que quedan si uno falla', async () => {
    await enqueuePickingItem(ADD_ITEM);
    await enqueuePickingItem(PRINT_ITEM);
    const fetch = vi.fn((url: string, _init?: RequestInit) =>
      url === '/api/picking-pallets' ? caido() : ok());
    const onFlushed = vi.fn();
    await flushPickingQueue(fetch, onFlushed);
    expect(fetch.mock.calls.map(c => c[0])).toEqual(['/api/picking-pallets', '/api/picking-prints']);
    expect(onFlushed).toHaveBeenCalledWith(1);
    const q = await loadPickingQueue();
    expect(q.map(i => i.payload.op)).toEqual(['add']);
  });
});

describe('migrarColaVieja', () => {
  it('no hace nada si no hay cola vieja', async () => {
    expect(await migrarColaVieja()).toBe(0);
  });

  it('trae lo pendiente y borra la clave vieja', async () => {
    // El día del despliegue: quien tenga pallets encolados sin señal los perdería enteros, porque
    // la pantalla nueva ni miraría esa clave.
    localStorage.setItem(CLAVE_VIEJA, JSON.stringify([ADD_ITEM, PRINT_ITEM]));
    expect(await migrarColaVieja()).toBe(2);
    expect(localStorage.getItem(CLAVE_VIEJA)).toBeNull();
    const q = await loadPickingQueue();
    expect(q.map(i => i.payload.op)).toEqual(['add', 'print']);
  });

  it('conserva el clientOpId de lo migrado', async () => {
    localStorage.setItem(CLAVE_VIEJA, JSON.stringify([ADD_ITEM]));
    await migrarColaVieja();
    expect((await loadPickingQueue())[0].clientOpId).toBe('op-add-1');
  });

  it('borra una clave vieja vacía sin encolar nada', async () => {
    localStorage.setItem(CLAVE_VIEJA, JSON.stringify([]));
    expect(await migrarColaVieja()).toBe(0);
    expect(localStorage.getItem(CLAVE_VIEJA)).toBeNull();
  });

  it('aguanta una clave vieja corrupta sin tirar', async () => {
    localStorage.setItem(CLAVE_VIEJA, 'no es json');
    expect(await migrarColaVieja()).toBe(0);
  });

  it('NO borra la clave vieja si el traspaso no se pudo guardar', async () => {
    // Mejor migrar dos veces (el client_op_id cubre el duplicado) que borrar trabajo que no quedó
    // guardado en ningún lado.
    localStorage.setItem(CLAVE_VIEJA, JSON.stringify([ADD_ITEM]));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cuota llena'); });
    expect(await migrarColaVieja()).toBe(0);
    vi.restoreAllMocks();
    expect(localStorage.getItem(CLAVE_VIEJA)).not.toBeNull();
  });
});
