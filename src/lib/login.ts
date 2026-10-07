import { paginaInicial, puedeAbrir } from '@/config/routes';

/** Lo mínimo de un error de auth-js que hace falta para explicarlo. Puro y testeable. */
export interface ErrorDeLogin {
  message: string;
  status?: number;
  code?: string;
  name?: string;
}

/**
 * Qué decirle a quien no pudo entrar, en español y diciendo qué hacer.
 *
 * Antes se buscaba el texto en inglés del mensaje y, si no calzaba, se mostraba tal cual. Así
 * aparecían "Failed to fetch" (sin señal) y "Request rate limit reached" (el límite de Supabase),
 * que en la bodega se leen como "el servidor me rebota". Ahora se decide por `code` y `status`,
 * que no cambian con el idioma ni con la versión de la librería.
 *
 * El límite es POR IP: todas las handheld de bodega salen a internet por la misma, así que los
 * intentos de todos suman juntos. Por eso el mensaje no culpa a la persona.
 */
export function mensajeDeErrorLogin(err: ErrorDeLogin, enLinea = true): string {
  const { status, code = '', name = '', message = '' } = err;

  if (code === 'invalid_credentials' || message.includes('Invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (code === 'email_not_confirmed' || message.includes('Email not confirmed')) {
    return 'Esta cuenta todavía no confirma su correo.';
  }
  if (code === 'user_banned') {
    return 'Esta cuenta está desactivada. Habla con un administrador.';
  }
  if (status === 429 || code === 'over_request_rate_limit' || /rate limit|too many/i.test(message)) {
    return 'Demasiados intentos desde esta red. Los equipos de bodega comparten el límite: espera unos minutos y vuelve a intentar.';
  }
  // Sin respuesta del servidor: auth-js lo marca como AuthRetryableFetchError (status 0) o deja el
  // "Failed to fetch" / "Load failed" del navegador.
  if (
    !enLinea || name === 'AuthRetryableFetchError' || status === 0 ||
    /failed to fetch|load failed|network/i.test(message)
  ) {
    return 'Sin conexión con el servidor. Revisa la señal e intenta de nuevo.';
  }
  if (status !== undefined && status >= 500) {
    return 'El servidor no respondió. Intenta de nuevo en un momento.';
  }
  return `No se pudo iniciar sesión${code ? ` (${code})` : ''}. Intenta de nuevo.`;
}

/**
 * Ruta de `?next=` que se puede usar: interna, no /login, y que el rol pueda abrir.
 *
 * Solo rutas propias ("/algo", nunca "//otro-sitio" ni "https://…"), para que un enlace armado no
 * mande a nadie fuera de la app después de escribir su contraseña.
 */
export function siguienteSegura(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  const ruta = next.split(/[?#]/)[0];
  if (ruta === '/login') return null;
  return next;
}

/**
 * A dónde ir después de entrar: a la pantalla que se quería abrir si el rol puede, si no a su
 * inicio. Usa la misma regla que el middleware (`paginaInicial`), así no hay un salto de más.
 */
export function destinoTrasLogin(
  meta: { role?: string; allowed_paths?: string[]; home_path?: string } | undefined,
  next?: string | null,
): string {
  const role = meta?.role ?? 'auditor';
  const paths = meta?.allowed_paths;
  const pedido = siguienteSegura(next);
  if (pedido && puedeAbrir(role, pedido.split(/[?#]/)[0], paths)) return pedido;
  return paginaInicial(role, paths, meta?.home_path);
}
