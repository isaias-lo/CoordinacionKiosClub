/**
 * [Panel Conductor · Fase 4] Cola offline de entregas pendientes de sincronizar.
 *
 * Por qué IndexedDB y no `localStorage` (que ya usa el resto de este módulo para el caché de
 * rutas): acá hay que guardar los BLOBS de las fotos, no solo texto — `localStorage` solo guarda
 * strings (habría que pasar por base64, ~33% más pesado, y el límite de 5-10MB se llena rápido
 * con fotos de cámara). IndexedDB guarda Blobs nativos y no tiene ese techo práctico.
 *
 * Nativo, sin librería: es un solo object store con operaciones simples (poner, listar, borrar) —
 * agregar una dependencia para esto sería más código que el que ahorra.
 *
 * Todo vuelve `null`/`[]`/silencioso ante cualquier falla (IndexedDB deshabilitado, cuota llena,
 * modo incógnito estricto en iOS) — igual que el try/catch de `localStorage` ya usado en
 * `cargar()`: la cola es una RED DE SEGURIDAD, nunca puede ser ella misma la razón de que el
 * chofer se quede sin poder registrar una entrega.
 */

const DB_NAME    = 'conductor_offline_queue';
const DB_VERSION = 1;
const STORE      = 'pendientes';

export interface FotoQueued {
  path: string;
  blob: Blob | null; // null si esta foto SÍ se subió antes de quedarse sin señal (ya tiene url)
  url: string | null;
}

export interface EntregaPendiente {
  id: string; // uuid — clave del registro
  rutaTiendaId: number;
  rutaId: number;
  storeCod: string;
  tipo: 'seco' | 'congelado';
  temperatura?: number;
  horaEntregaLocal: string; // ISO — el momento REAL en que el chofer confirmó, no el de sync
  fotos: FotoQueued[];
  intentos: number;
  ultimoError?: string;
  createdAt: number;
}

function abrirDB(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function encolarEntrega(item: EntregaPendiente): Promise<void> {
  const db = await abrirDB();
  if (!db) return; // sin IndexedDB no hay cola — el llamador ya decidió qué mostrar en pantalla
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function listarPendientes(): Promise<EntregaPendiente[]> {
  const db = await abrirDB();
  if (!db) return [];
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as EntregaPendiente[]);
      req.onerror   = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

export async function actualizarPendiente(item: EntregaPendiente): Promise<void> {
  return encolarEntrega(item); // `put` reemplaza — mismo `id`, mismo registro
}

export async function eliminarPendiente(id: string): Promise<void> {
  const db = await abrirDB();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Cuántas paradas quedan sin sincronizar — para el badge del header. */
export async function contarPendientes(): Promise<number> {
  return (await listarPendientes()).length;
}

/* ── Lógica pura (sin IndexedDB) — separada para poder testearla directo. ── */

/** Las fotos de una entrega pendiente que todavía no tienen URL (hay que subirlas primero). */
export function fotosSinSubir(item: EntregaPendiente): FotoQueued[] {
  return item.fotos.filter(f => !f.url);
}

/** Una entrega pendiente está lista para el PATCH final una vez que TODAS sus fotos tienen URL —
 *  ya sea porque se subieron antes de perder señal, o porque el drenado de la cola las subió. */
export function entregaListaParaPatch(item: EntregaPendiente): boolean {
  return item.fotos.length > 0 && item.fotos.every(f => !!f.url);
}
