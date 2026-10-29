// La subida del estado compartido cuando la app se oculta o se cierra. Puro: arma la petición.
//
// Existe por el análisis de Bodega del 22/10/2026 (L2). Se unió P3 en P2 y se cerró el navegador a
// los 2,5 s: la base quedó bien, pero el estado compartido no, y al volver a abrir la tienda
// aparecían P2 con el peso de antes y P3 vivo. Ya había un flush al ocultarse (`useVisibilityRefetch`),
// pero subía con supabase-js, que primero espera la sesión (`await getSession()`) y después hace un
// fetch común: al cerrar la página, el navegador corta lo que quede pendiente y la subida no sale.
//
// Esta petición sale con `keepalive`, que el navegador termina aunque la página se cierre, y con el
// token ya en la mano (nada de esperar). El navegador acepta hasta 64 KB entre todas las peticiones
// keepalive en vuelo; el estado de RM/Costa llegó a 45 KB en octubre. Por encima del tope se
// devuelve `null` y se sube por el camino de siempre, que en una app que solo se oculta funciona igual.

/** Por debajo de los 64 KB que el navegador acepta en peticiones keepalive, con margen. */
export const TOPE_KEEPALIVE_BYTES = 60_000;

export interface PeticionAlCerrar { url: string; init: RequestInit }

export function armarSubidaAlCerrar(p: {
  baseUrl: string;
  apiKey: string;
  token: string | null;
  fuente: string;
  fecha: string;
  state: unknown;
  userId?: string;
  ahora?: Date;
}): PeticionAlCerrar | null {
  if (!p.token || !p.baseUrl) return null;
  const fila: Record<string, unknown> = {
    fecha: p.fecha,
    fuente: p.fuente,
    state: p.state,
    updated_at: (p.ahora ?? new Date()).toISOString(),
  };
  if (p.userId) fila.updated_by = p.userId;
  const body = JSON.stringify(fila);
  if (new TextEncoder().encode(body).length > TOPE_KEEPALIVE_BYTES) return null;
  return {
    url: `${p.baseUrl.replace(/\/+$/, '')}/rest/v1/shared_session_state?on_conflict=fecha,fuente&select=updated_at`,
    init: {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: p.apiKey,
        Authorization: `Bearer ${p.token}`,
        'Content-Type': 'application/json',
        // El mismo upsert que hace `pushSessionStateResult` con supabase-js, y también pide de
        // vuelta `updated_at`: si la página sigue viva, el reloj del servidor se usa igual (C3/RC-6).
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body,
    },
  };
}

/** El `updated_at` de la respuesta, en ms, o `null` si no viene. */
export function marcaDeRespuesta(filas: unknown): number | null {
  const f = Array.isArray(filas) ? filas[0] : filas;
  const t = (f as { updated_at?: unknown } | null)?.updated_at;
  if (typeof t !== 'string') return null;
  const ms = new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
}
