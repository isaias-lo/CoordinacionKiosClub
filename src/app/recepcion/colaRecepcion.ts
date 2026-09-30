import { guardar, listar, eliminar } from '@/lib/offline/almacen';
import { drenar } from '@/lib/offline/drenar';
import { clasificarEstado, bloqueados as soloBloqueados } from '@/lib/offline/resultado';
import type { ItemCola } from '@/lib/offline/tipos';

/**
 * [Recepción de tienda] Cola de confirmaciones que no se pudieron enviar.
 *
 * Esta pantalla es la única de las tres que hasta ahora NO tenía cola, y a propósito: fallaba
 * fuerte para no mostrarle un "guardado" falso al encargado de tienda. Esa garantía se conserva
 * entera. Lo que cambia es que ahora, además de avisar que no salió, se guarda para poder mandarlo
 * solo — pero la pantalla NO dice "listo" hasta que el servidor confirma. Ver `RecepcionClient`.
 *
 * El payload es el cuerpo exacto del POST, con las fotos ya convertidas a data URL. Guardar el
 * cuerpo armado y no las piezas sueltas evita que un cambio en cómo se arma deje inservible lo que
 * quedó encolado con la versión anterior.
 */

/** El cuerpo tal cual se manda a /api/recepcion. Se guarda armado, ver arriba. */
export type CuerpoRecepcion = Record<string, unknown> & { cod: string; tienda: string };

export type RecepcionPendiente = ItemCola<CuerpoRecepcion>;

/**
 * Sin respaldo en localStorage, al revés que picking.
 *
 * El payload es texto, así que técnicamente cabría. Pero son hasta ocho fotos en data URL: con la
 * sobrecarga del base64 eso pasa los 5MB de cuota de localStorage sin esfuerzo, y el fallo llega
 * como una excepción al guardar, es decir en el peor momento. IndexedDB no tiene ese techo.
 */
const OPCIONES = { permiteRespaldo: false } as const;

function nuevoId(): string {
  try { return crypto.randomUUID(); }
  catch { return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

/**
 * Guarda una confirmación para mandarla después. Devuelve si quedó guardada de verdad.
 *
 * El llamador NECESITA esa respuesta: si no se pudo encolar, la pantalla tiene que decir que no
 * salió y que hay que reintentar a mano. Un "queda pendiente" sobre algo que no se guardó en
 * ningún lado sería exactamente el falso "listo" que esta pantalla evita desde siempre.
 */
export async function encolarRecepcion(cuerpo: CuerpoRecepcion, clientOpId: string): Promise<boolean> {
  return guardar<CuerpoRecepcion>(
    { id: nuevoId(), modulo: 'recepcion', clientOpId, payload: cuerpo, intentos: 0, createdAt: Date.now() },
    OPCIONES,
  );
}

export async function listarRecepcionesPendientes(): Promise<RecepcionPendiente[]> {
  return listar<CuerpoRecepcion>('recepcion');
}

/** Las que el servidor rechazó de forma definitiva: ya no se reintentan y hay que mostrarlas. */
export async function recepcionesBloqueadas(): Promise<RecepcionPendiente[]> {
  return soloBloqueados(await listarRecepcionesPendientes());
}

/**
 * Intenta mandar lo que haya pendiente.
 *
 * El `clientOpId` viaja en el cuerpo desde el primer intento, y /api/recepcion lo usa para no
 * duplicar: si la petición llegó y lo que se perdió fue la respuesta, el reintento devuelve el
 * registro que ya existe en vez de crear otro.
 */
export async function drenarRecepciones(): Promise<{ enviadas: number; bloqueadas: number }> {
  const items = await listarRecepcionesPendientes();
  if (items.length === 0) return { enviadas: 0, bloqueadas: 0 };

  const { enviados, bloqueados } = await drenar<CuerpoRecepcion>(
    items,
    async item => {
      const res = await fetch('/api/recepcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload),
      });
      return { veredicto: clasificarEstado(res.status), mensaje: `HTTP ${res.status}` };
    },
    { guardar: item => guardar(item, OPCIONES), eliminar },
  );

  return { enviadas: enviados, bloqueadas: bloqueados };
}
