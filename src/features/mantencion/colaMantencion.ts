import { guardar, listar, eliminar } from '@/lib/offline/almacen';
import { drenar } from '@/lib/offline/drenar';
import { clasificarEstado, type Veredicto } from '@/lib/offline/resultado';
import type { ItemCola } from '@/lib/offline/tipos';

/**
 * [Mantención] Solicitudes que el supervisor creó sin señal.
 *
 * Usa la cola offline única (`lib/offline`), igual que Recepción: se guarda el cuerpo del POST ya
 * armado, con las fotos en data URL, y el `clientOpId` viaja desde el primer intento para que un
 * reenvío no cree una segunda solicitud (ver la idempotencia de `/api/mantencion/solicitudes`).
 *
 * Además del cuerpo se guarda lo mínimo para DIBUJAR la solicitud en la lista mientras espera
 * («Por enviar»): el nombre de la tienda y la hora. El servidor no lo recibe.
 */

/** El cuerpo tal cual va a /api/mantencion/solicitudes. */
export interface CuerpoSolicitud {
  codigoTienda: string;
  categoria: string;
  descripcion: string;
  /** Data URL de cada foto. */
  fotos: string[];
  clientOpId: string;
}

export interface SolicitudEnCola {
  cuerpo: CuerpoSolicitud;
  vista: { nombreTienda: string; creadaEn: string };
}

export type SolicitudPendiente = ItemCola<SolicitudEnCola>;

/** Sin respaldo en localStorage: cinco fotos en base64 pasan su cuota (ver `colaRecepcion.ts`). */
const OPCIONES = { permiteRespaldo: false } as const;

/** Guarda una solicitud para mandarla después. Devuelve si quedó guardada DE VERDAD. */
export async function encolarSolicitud(item: SolicitudEnCola): Promise<boolean> {
  return guardar<SolicitudEnCola>(
    {
      id: item.cuerpo.clientOpId, modulo: 'mantencion', clientOpId: item.cuerpo.clientOpId,
      payload: item, intentos: 0, createdAt: Date.now(),
    },
    OPCIONES,
  );
}

export async function solicitudesEnCola(): Promise<SolicitudPendiente[]> {
  return listar<SolicitudEnCola>('mantencion');
}

/**
 * Un 401 se reintenta, al revés que en la regla general.
 *
 * Una solicitud puede pasar días en el celular, y en ese tiempo la sesión vence. Eso no es un
 * rechazo de la solicitud: al abrir la app la sesión se renueva y el reintento entra. Marcarla
 * como rechazada le haría rehacer al supervisor una solicitud que estaba bien.
 */
export function veredictoMantencion(status: number): Veredicto {
  if (status === 401) return 'reintentar';
  return clasificarEstado(status);
}

/** Manda lo que haya pendiente. */
export async function drenarSolicitudes(): Promise<{ enviadas: number; bloqueadas: number }> {
  const items = await solicitudesEnCola();
  if (items.length === 0) return { enviadas: 0, bloqueadas: 0 };

  const { enviados, bloqueados } = await drenar<SolicitudEnCola>(
    items,
    async item => {
      const res = await fetch('/api/mantencion/solicitudes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload.cuerpo),
      });
      let mensaje = `HTTP ${res.status}`;
      try { const j = await res.json(); if (j?.error) mensaje = String(j.error); } catch { /* sin cuerpo */ }
      return { veredicto: veredictoMantencion(res.status), mensaje };
    },
    { guardar: item => guardar(item, OPCIONES), eliminar },
  );
  return { enviadas: enviados, bloqueadas: bloqueados };
}

/** Quita de la cola una solicitud rechazada, cuando el supervisor decide descartarla. */
export async function descartarDeCola(id: string): Promise<void> {
  await eliminar(id);
}
