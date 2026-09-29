import { guardar, listar, eliminar, contar } from '@/lib/offline/almacen';
import { drenar } from '@/lib/offline/drenar';
import { clasificarEstado, bloqueados as soloBloqueados } from '@/lib/offline/resultado';
import type { ItemCola } from '@/lib/offline/tipos';

/**
 * Cola offline de picking. Desde la cola única (`src/lib/offline/`): antes vivía en localStorage
 * por su cuenta, con su propio formato y su propia contabilidad de reintentos.
 *
 * Operaciones soportadas:
 *  - add:    Agregar un slot de pallet (POST /api/picking-pallets)
 *  - print:  Registrar una impresión  (POST /api/picking-prints)
 */

export type OfflineQueueItem =
  | {
      op: 'add';
      stateKey: string; storeCod: string; pickerLabel: string;
      tipo: string; contenido: string; section?: string | null; refs: string; date: string;
      clientOpId?: string;  // idempotencia: el replay reusa el mismo id ⇒ no duplica
      actorName?: string;   // atribución: conserva quién creó aunque se reenvíe offline
      // El peso viaja en la cola: si se pesó sin red, ese dato no se puede perder — nadie va a
      // volver a subir el pallet a la balanza cuando vuelva la señal.
      medidas?: { peso_kg: number | null; alto: number | null; largo: number | null; ancho: number | null; peso_v: number | null };
    }
  | {
      op: 'print';
      stateKey: string; pickerLabel: string; pallets: number;
      tipo: string; date: string; printedByName: string; batch?: string;
    };

export type PendientePicking = ItemCola<OfflineQueueItem>;

/** Clave de la cola vieja en localStorage. Se lee una sola vez, al migrar. Ver `migrarColaVieja`. */
const CLAVE_VIEJA = 'picking_offline_queue_v1';

function nuevoId(): string {
  try { return crypto.randomUUID(); }
  catch { return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

/**
 * Picking permite el respaldo en localStorage porque su payload es texto puro: no hay ningún Blob
 * que `JSON.stringify` pueda convertir en `{}` sin avisar. Y lo necesita, porque es justamente de
 * localStorage de donde viene: sin el respaldo, un navegador con IndexedDB bloqueado perdería una
 * capacidad que hoy tiene.
 */
const OPCIONES = { permiteRespaldo: true } as const;

export async function enqueuePickingItem(op: OfflineQueueItem): Promise<void> {
  // El `clientOpId` de `add` ya viene armado desde la pantalla, porque el primer intento ONLINE lo
  // mandó con ese mismo id: si la petición sí llegó y lo que se perdió fue la respuesta, el reenvío
  // tiene que repetirlo para que el servidor lo reconozca en vez de crear un segundo pallet.
  const clientOpId = (op.op === 'add' && op.clientOpId) || nuevoId();
  await guardar<OfflineQueueItem>(
    { id: nuevoId(), modulo: 'picking', clientOpId, payload: op, intentos: 0, createdAt: Date.now() },
    OPCIONES,
  );
}

export async function loadPickingQueue(): Promise<PendientePicking[]> {
  return listar<OfflineQueueItem>('picking');
}

/** Las que el servidor rechazó de forma definitiva: ya no se reintentan y hay que avisarlas. */
export async function bloqueadasPicking(): Promise<PendientePicking[]> {
  return soloBloqueados(await loadPickingQueue());
}

export async function contarPendientesPicking(): Promise<number> {
  return contar('picking');
}

/**
 * Trae lo que haya quedado en la cola vieja de localStorage y borra esa clave.
 *
 * Existe por el día del despliegue: quien tenga pallets encolados sin señal cuando le llegue la
 * versión nueva, los perdería enteros — la pantalla nueva ni miraría esa clave.
 *
 * Solo borra la clave vieja si el traspaso se confirmó. Si IndexedDB y el respaldo fallan los dos,
 * lo de antes se queda donde está y se reintenta la próxima vez que abra: mejor migrar dos veces
 * (el `client_op_id` de `add` cubre el duplicado) que borrar trabajo que no se guardó en ningún
 * lado.
 */
export async function migrarColaVieja(): Promise<number> {
  let viejos: OfflineQueueItem[];
  try {
    const crudo = localStorage.getItem(CLAVE_VIEJA);
    if (!crudo) return 0;
    const datos = JSON.parse(crudo);
    if (!Array.isArray(datos) || datos.length === 0) { localStorage.removeItem(CLAVE_VIEJA); return 0; }
    viejos = datos as OfflineQueueItem[];
  } catch {
    return 0;
  }

  let migrados = 0;
  for (const op of viejos) {
    const clientOpId = (op.op === 'add' && op.clientOpId) || nuevoId();
    const ok = await guardar<OfflineQueueItem>(
      { id: nuevoId(), modulo: 'picking', clientOpId, payload: op, intentos: 0, createdAt: Date.now() },
      OPCIONES,
    );
    if (ok) migrados++;
  }

  if (migrados === viejos.length) {
    try { localStorage.removeItem(CLAVE_VIEJA); } catch { /* da igual: al reintentar se deduplica */ }
  }
  return migrados;
}

function cuerpo(op: OfflineQueueItem, clientOpId: string): { url: string; body: string } {
  if (op.op === 'add') {
    return {
      url: '/api/picking-pallets',
      body: JSON.stringify({
        date: op.date, store_cod: op.storeCod, state_key: op.stateKey,
        picker_label: op.pickerLabel, tipo: op.tipo,
        contenido: op.contenido, section: op.section ?? null, refs: op.refs,
        client_op_id: clientOpId, actor_name: op.actorName,
        ...(op.medidas ?? {}),
      }),
    };
  }
  // Ojo: /api/picking-prints todavía NO mira `client_op_id` — la idempotencia de la cola la da el
  // servidor, y ese endpoint no la implementa. Se manda igual para que empiece a llegar el día que
  // se agregue, pero hoy un reintento que sí llegó y perdió la respuesta registra la impresión dos
  // veces. Es lo mismo que pasaba antes de la cola única; queda anotado para no darlo por resuelto.
  return {
    url: '/api/picking-prints',
    body: JSON.stringify({
      stateKey: op.stateKey, pickerLabel: op.pickerLabel,
      pallets: op.pallets, tipo: op.tipo, date: op.date,
      printedByName: op.printedByName, batch: op.batch ?? '',
      client_op_id: clientOpId,
    }),
  };
}

/**
 * Intenta enviar la cola. Lo que falla por falta de señal se queda para el próximo intento; lo que
 * el servidor rechaza de forma definitiva se marca y deja de reintentarse (ver `bloqueado` en
 * `src/lib/offline/tipos.ts`).
 */
export async function flushPickingQueue(
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>,
  onFlushed: (count: number) => void,
  onBloqueadas?: (count: number) => void,
): Promise<void> {
  const items = await loadPickingQueue();
  if (items.length === 0) return;

  const { enviados, bloqueados } = await drenar<OfflineQueueItem>(
    items,
    async item => {
      const { url, body } = cuerpo(item.payload, item.clientOpId);
      const res = await authedFetch(url, { method: 'POST', body });
      return { veredicto: clasificarEstado(res.status), mensaje: `HTTP ${res.status}` };
    },
    { guardar: item => guardar(item, OPCIONES), eliminar },
  );

  if (enviados > 0) onFlushed(enviados);
  if (bloqueados > 0) onBloqueadas?.(bloqueados);
}
