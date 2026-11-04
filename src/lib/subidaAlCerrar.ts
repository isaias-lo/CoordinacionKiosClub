// Que la última subida de Bodega llegue aunque se cierre la app.
//
// ── POR QUÉ (análisis del 22/10/2026, punto L2; pedido de Isaias del 4/11/2026) ─────────────────
//
// Al ocultarse la página (`pagehide`, `visibilitychange`) los contextos ya empujan lo pendiente
// (`useVisibilityRefetch` → `flushPending`). Pero ese empuje es un fetch común de supabase-js, y el
// navegador CANCELA los fetch comunes de una página que se cierra: la subida salía y no llegaba.
// En la prueba de FLORIDA (unir P3 en P2 y cerrar a los 2,5 s) los otros equipos siguieron viendo
// P3 vivo y P2 con el peso de antes.
//
// `keepalive: true` es la forma del navegador de dejar terminar una petición después de cerrar la
// página. supabase-js no deja pedirla por consulta, así que el cliente usa `fetchConKeepalive`: por
// un momento después de `pedirKeepalive()`, las escrituras salen con keepalive. El momento es una
// ventana de tiempo y no un interruptor porque supabase-js espera el token de sesión antes de hacer
// el fetch, y para entonces un interruptor ya se habría apagado.
//
// El navegador limita keepalive a 64 KB de cuerpo. El estado de RM/Costa de un día lleno anda por
// 35-52 KB (medido el 4/11/2026), así que entra; si algún día no entra, el navegador rechaza el
// fetch al tiro y se manda como siempre, sin keepalive.

/** Cuánto dura la ventana después de `pedirKeepalive()`. Alcanza para leer el token y salir. */
export const VENTANA_KEEPALIVE_MS = 1500;

let hasta = 0;

/** Las escrituras de los próximos instantes salen con keepalive. Llamar justo antes de empujar. */
export function pedirKeepalive(ahora = Date.now()): void {
  hasta = ahora + VENTANA_KEEPALIVE_MS;
}

/** ¿Esta petición va con keepalive? Solo escrituras (las lecturas no importan al cerrar). */
export function llevaKeepalive(metodo: string | undefined, ahora: number, limite: number): boolean {
  return ahora < limite && !!metodo && metodo.toUpperCase() !== 'GET' && metodo.toUpperCase() !== 'HEAD';
}

/** El `fetch` del cliente de Supabase. Ver la cabecera. */
export const fetchConKeepalive: typeof fetch = async (input, init) => {
  if (llevaKeepalive(init?.method, Date.now(), hasta)) {
    try {
      return await fetch(input, { ...init, keepalive: true });
    } catch (e) {
      // Cuerpo de más de 64 KB (o sin red): una vez más, como siempre.
      if (!(e instanceof TypeError)) throw e;
    }
  }
  return fetch(input, init);
};
