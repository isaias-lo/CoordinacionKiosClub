import type { ItemCola, ModuloOffline } from './tipos';

/**
 * [Cola offline única] Dónde se guarda lo que todavía no se pudo enviar.
 *
 * IndexedDB, por lo mismo que ya explicaba la cola del conductor: hay que guardar los BLOBS de las
 * fotos, y localStorage solo guarda strings (habría que pasar por base64, ~33% más pesado, con un
 * techo de 5-10MB que una cámara llena en nada).
 *
 * Nativo y sin librería: es un object store con operaciones simples.
 *
 * Todo devuelve `[]`/silencioso ante cualquier falla. La cola es una RED DE SEGURIDAD: nunca puede
 * ser ella misma la razón de que alguien no pueda registrar su trabajo.
 */

const DB_NAME    = 'kc_offline_queue';
const DB_VERSION = 1;
const STORE      = 'items';

/**
 * Respaldo en localStorage para los módulos que no guardan blobs.
 *
 * Está porque picking hasta ahora vivía en localStorage y ahí funcionaba. Si IndexedDB no está
 * disponible (almacenamiento bloqueado por política, algún modo privado estricto), pasar a "solo
 * IndexedDB" le sacaría a picking una capacidad que hoy tiene, en silencio y justo cuando más
 * hace falta. El respaldo lo deja igual que antes.
 *
 * No se usa para conductor ni recepción: ahí el payload lleva Blobs, y `JSON.stringify` los
 * convierte en `{}` sin avisar. Guardar una entrega con la foto convertida en un objeto vacío
 * sería peor que no guardarla, así que esos módulos piden IndexedDB o nada — por eso el respaldo
 * se habilita explícitamente en cada llamada y no se adivina mirando el payload.
 */
const CLAVE_RESPALDO = 'kc_cola_offline_respaldo_v1';

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
      // Si otra pestaña dejó la base bloqueada esperando un upgrade, `onsuccess` no llega nunca.
      // Sin esto la promesa quedaría colgada y con ella toda la pantalla que la esté esperando.
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/* ── Respaldo en localStorage (solo texto) ────────────────────────────────── */

function leerRespaldo(): ItemCola[] {
  try {
    const crudo = localStorage.getItem(CLAVE_RESPALDO);
    const datos = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? (datos as ItemCola[]) : [];
  } catch {
    return [];
  }
}

function escribirRespaldo(items: ItemCola[]): boolean {
  try {
    localStorage.setItem(CLAVE_RESPALDO, JSON.stringify(items));
    return true;
  } catch {
    return false; // cuota llena o almacenamiento bloqueado
  }
}

/* ── API de la cola ───────────────────────────────────────────────────────── */

/**
 * Guarda (o reemplaza, mismo `id`) un ítem.
 *
 * Devuelve si quedó guardado de verdad. El llamador necesita saberlo: la migración de picking borra
 * la cola vieja solo cuando la nueva confirmó, y una pantalla puede querer avisar que el trabajo no
 * se pudo ni encolar.
 *
 * `permiteRespaldo` solo lo ponen en `true` los módulos cuyo payload es texto puro. Ver arriba.
 */
export async function guardar<P>(
  item: ItemCola<P>,
  opciones: { permiteRespaldo?: boolean } = {},
): Promise<boolean> {
  const db = await abrirDB();
  if (db) {
    const ok = await new Promise<boolean>(resolve => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(item);
        tx.oncomplete = () => resolve(true);
        tx.onerror    = () => resolve(false);
        tx.onabort    = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    if (ok) return true;
  }
  if (!opciones.permiteRespaldo) return false;
  const resto = leerRespaldo().filter(i => i.id !== item.id);
  return escribirRespaldo([...resto, item as ItemCola]);
}

/**
 * Los ítems de un módulo, del más viejo al más nuevo.
 *
 * El orden importa y no es el que da IndexedDB: `getAll` devuelve por clave, y las claves son uuid,
 * o sea orden aleatorio. En picking una impresión se refiere a los pallets agregados antes que
 * ella; mandarlas al revés registra una impresión de pallets que todavía no existen.
 */
export async function listar<P>(modulo: ModuloOffline): Promise<ItemCola<P>[]> {
  const db = await abrirDB();
  const deIDB = db
    ? await new Promise<ItemCola<P>[]>(resolve => {
        try {
          const tx  = db.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => resolve((req.result ?? []) as ItemCola<P>[]);
          req.onerror   = () => resolve([]);
        } catch {
          resolve([]);
        }
      })
    : [];
  const delRespaldo = leerRespaldo() as ItemCola<P>[];
  return [...deIDB, ...delRespaldo]
    .filter(i => i.modulo === modulo)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function eliminar(id: string): Promise<void> {
  const db = await abrirDB();
  if (db) {
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => resolve();
        tx.onabort    = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  // También del respaldo: un ítem puede haber quedado ahí de una sesión en la que IndexedDB no
  // estaba, y si no se borra se reenviaría para siempre.
  const respaldo = leerRespaldo();
  if (respaldo.some(i => i.id === id)) escribirRespaldo(respaldo.filter(i => i.id !== id));
}

/** Cuántos quedan sin enviar en un módulo, para el contador del encabezado. */
export async function contar(modulo: ModuloOffline): Promise<number> {
  return (await listar(modulo)).length;
}
