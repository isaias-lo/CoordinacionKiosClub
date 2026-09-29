import { guardar, listar, eliminar } from '@/lib/offline/almacen';
import { pendientesDeEnvio, bloqueados as soloBloqueados } from '@/lib/offline/resultado';
import type { ItemCola } from '@/lib/offline/tipos';

/**
 * [Panel Conductor] Cola de entregas pendientes de sincronizar.
 *
 * Esta cola fue el molde del que salió la compartida (`src/lib/offline/`): era la única de las
 * tres que ya usaba IndexedDB y aguantaba los blobs de las fotos. Ahora usa esa pieza compartida
 * en vez de su propia copia, así que el almacenamiento, la cuenta de reintentos y la marca de
 * rechazo definitivo son los mismos que usan picking y recepción.
 *
 * Lo que NO se comparte es el envío, porque acá son dos pasos: primero suben las fotos, una por
 * una, y recién con todas sus URLs va el PATCH final. Eso vive en `page.tsx`.
 */

export interface FotoQueued {
  path: string;
  blob: Blob | null; // null si esta foto SÍ se subió antes de quedarse sin señal (ya tiene url)
  url: string | null;
}

/** Los datos de la entrega. Lo de la cola en sí (intentos, bloqueado…) vive en `ItemCola`. */
export interface EntregaPendiente {
  rutaTiendaId: number;
  rutaId: number;
  storeCod: string;
  tipo: 'seco' | 'congelado';
  temperatura?: number;
  horaEntregaLocal: string; // ISO — el momento REAL en que el chofer confirmó, no el de sync
  fotos: FotoQueued[];
  /** [Flujo único + OTP] Quién recibió la entrega — igual de obligatorio que en el flujo viejo
   *  que se retiró; sin esto no hay prueba de QUIÉN aceptó la mercadería, solo fotos. */
  receptor: string;
  rut: string;
  observaciones?: string;
  /** El código ya se verificó (PUT /api/recepcion-otp) antes de encolar — la cola solo reenvía la
   *  prueba de esa verificación, nunca repite el OTP en sí. */
  otpToken: string;
  otpEmail: string;
  otpCodigo: string;
  /**
   * Comprobante firmado de esa misma verificación, atado a ESTA entrega y con 72 horas de vida.
   *
   * Existe porque `otpToken` vence a los 10 minutos, y ese plazo es justo el que la cola no puede
   * garantizar: es la que entra a jugar cuando el chofer se queda sin señal. Ver
   * `createReciboEntrega` en src/lib/otpToken.ts.
   *
   * Opcional porque los ítems encolados por la versión anterior no lo traen. Esos ya no se pueden
   * rescatar (su token venció), pero al menos dejan de reintentarse a ciegas: se bloquean.
   */
  recibo?: string;
}

export type PendienteEntrega = ItemCola<EntregaPendiente>;

/**
 * Sin respaldo en localStorage: acá el payload lleva los Blobs de las fotos, y `JSON.stringify`
 * los convierte en `{}` sin avisar. Una entrega con la foto hecha un objeto vacío sería peor que
 * no guardarla. IndexedDB o nada.
 */
const OPCIONES = { permiteRespaldo: false } as const;

function nuevoId(): string {
  try { return crypto.randomUUID(); }
  catch { return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export async function encolarEntrega(entrega: EntregaPendiente): Promise<boolean> {
  const id = nuevoId();
  return guardar<EntregaPendiente>(
    // La parada identifica la operación: reenviar la misma entrega no puede registrar dos.
    { id, modulo: 'conductor', clientOpId: `ruta_tienda:${entrega.rutaTiendaId}`,
      payload: entrega, intentos: 0, createdAt: Date.now() },
    OPCIONES,
  );
}

export async function listarPendientes(): Promise<PendienteEntrega[]> {
  return listar<EntregaPendiente>('conductor');
}

export async function actualizarPendiente(item: PendienteEntrega): Promise<boolean> {
  return guardar(item, OPCIONES); // `put` reemplaza — mismo `id`, mismo registro
}

export async function eliminarPendiente(id: string): Promise<void> {
  await eliminar(id);
}

/** Cuántas paradas quedan sin sincronizar — para el badge del header. */
export async function contarPendientes(): Promise<number> {
  return pendientesDeEnvio(await listarPendientes()).length;
}

/* ── Lógica pura (sin IndexedDB) — separada para poder testearla directo. ── */

/** Las fotos de una entrega pendiente que todavía no tienen URL (hay que subirlas primero). */
export function fotosSinSubir(entrega: EntregaPendiente): FotoQueued[] {
  return entrega.fotos.filter(f => !f.url);
}

/** Una entrega pendiente está lista para el PATCH final una vez que TODAS sus fotos tienen URL —
 *  ya sea porque se subieron antes de perder señal, o porque el drenado de la cola las subió. */
export function entregaListaParaPatch(entrega: EntregaPendiente): boolean {
  return entrega.fotos.length > 0 && entrega.fotos.every(f => !!f.url);
}

/** Las que el servidor rechazó de forma definitiva: no se reintentan y se muestran en rojo. */
export function soloLasBloqueadas(items: PendienteEntrega[]): PendienteEntrega[] {
  return soloBloqueados(items);
}

/* ── Migración de la cola anterior ─────────────────────────────────────────── */

const DB_VIEJA    = 'conductor_offline_queue';
const STORE_VIEJO = 'pendientes';

/** El registro tal cual lo guardaba la versión anterior: todo plano en el mismo objeto. */
type RegistroViejo = EntregaPendiente & {
  id: string; intentos?: number; ultimoError?: string; bloqueado?: boolean; createdAt?: number;
};

function abrirDBVieja(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      // Sin número de versión: abre la que exista y NO la crea si no está. Pedir una versión haría
      // que este código creara la base vieja en cada teléfono que nunca la tuvo.
      const req = indexedDB.open(DB_VIEJA);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_VIEJO)) { db.close(); resolve(null); return; }
        resolve(db);
      };
      req.onerror   = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Trae a la cola compartida lo que haya quedado en la base anterior.
 *
 * Esto NO es opcional: son entregas ya confirmadas con la tienda, con sus fotos, que viven solo en
 * el teléfono del chofer. Si la versión nueva dejara de mirar la base vieja, se perderían enteras
 * y en silencio — exactamente la falla que esta cola se pasó dos PRs arreglando.
 *
 * Cada una se borra de la base vieja solo DESPUÉS de confirmar que quedó guardada en la nueva. Si
 * el guardado falla, se queda donde está y se reintenta la próxima vez que abra: migrar dos veces
 * no duplica nada (el `clientOpId` es la parada), perder una entrega sí es irreversible.
 */
export async function migrarColaVieja(): Promise<number> {
  const db = await abrirDBVieja();
  if (!db) return 0;

  const viejos = await new Promise<RegistroViejo[]>(resolve => {
    try {
      const tx  = db.transaction(STORE_VIEJO, 'readonly');
      const req = tx.objectStore(STORE_VIEJO).getAll();
      req.onsuccess = () => resolve((req.result ?? []) as RegistroViejo[]);
      req.onerror   = () => resolve([]);
    } catch {
      resolve([]);
    }
  });

  let migradas = 0;
  for (const viejo of viejos) {
    const { id, intentos, ultimoError, bloqueado, createdAt, ...entrega } = viejo;
    const ok = await guardar<EntregaPendiente>(
      {
        id, modulo: 'conductor', clientOpId: `ruta_tienda:${entrega.rutaTiendaId}`,
        payload: entrega as EntregaPendiente,
        intentos: intentos ?? 0, ultimoError, bloqueado,
        createdAt: createdAt ?? Date.now(),
      },
      OPCIONES,
    );
    if (!ok) continue;
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction(STORE_VIEJO, 'readwrite');
        tx.objectStore(STORE_VIEJO).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => resolve();
        tx.onabort    = () => resolve();
      } catch {
        resolve();
      }
    });
    migradas++;
  }

  db.close();
  return migradas;
}
