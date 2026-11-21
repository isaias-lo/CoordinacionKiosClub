// Las llamadas del navegador a /api/mantencion. La sesión viaja en la cookie (ver apiAuth).
//
// `no-store` en todo: una lista cacheada se ve idéntica a una al día, y en Mantención eso es una
// pregunta que la tienda no ve o una solicitud que «no llegó» (ver el mismo caso en backlogV2.ts).

import type { ComentarioMant, ContextoMant, SolicitudMant } from './tipos';
import type { CuerpoSolicitud } from './colaMantencion';

async function leer<T>(res: Response): Promise<T> {
  let json: unknown = null;
  try { json = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ?? `Error ${res.status}`;
    throw new ErrorApi(msg, res.status);
  }
  return json as T;
}

export class ErrorApi extends Error {
  constructor(mensaje: string, readonly status: number) { super(mensaje); }
}

export async function traerContexto(): Promise<ContextoMant> {
  return leer<ContextoMant>(await fetch('/api/mantencion/contexto', { cache: 'no-store' }));
}

export async function traerSolicitudes(tienda?: string): Promise<SolicitudMant[]> {
  const q = tienda ? `?tienda=${encodeURIComponent(tienda)}` : '';
  const r = await leer<{ solicitudes: SolicitudMant[] }>(
    await fetch(`/api/mantencion/solicitudes${q}`, { cache: 'no-store' }));
  return r.solicitudes;
}

/**
 * Crea una solicitud. Distingue las dos fallas porque la pantalla hace cosas distintas con cada una:
 *
 *  · `red`: no llegó (sin señal, servidor caído, sesión vencida). Va a la cola y sale sola.
 *  · `rechazo`: llegó y el servidor dijo que está mal. Encolarla sería reintentar para siempre
 *    algo que nunca va a pasar; hay que mostrar el motivo y que la persona lo corrija.
 */
export async function crearSolicitud(cuerpo: CuerpoSolicitud):
  Promise<{ ok: true; id: string } | { ok: false; red: boolean; error: string }> {
  let res: Response;
  try {
    res = await fetch('/api/mantencion/solicitudes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
    });
  } catch {
    return { ok: false, red: true, error: 'Sin conexión' };
  }
  try {
    const r = await leer<{ id: string }>(res);
    return { ok: true, id: r.id };
  } catch (e) {
    const status = e instanceof ErrorApi ? e.status : 0;
    const definitivo = status >= 400 && status < 500 && ![401, 408, 425, 429].includes(status);
    return { ok: false, red: !definitivo, error: e instanceof Error ? e.message : 'Error' };
  }
}

export async function comentar(
  solicitudId: string, tipo: ComentarioMant['tipo'], texto: string,
): Promise<ComentarioMant> {
  const r = await leer<{ comentario: ComentarioMant }>(await fetch('/api/mantencion/comentarios', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ solicitudId, tipo, texto }),
  }));
  return r.comentario;
}
