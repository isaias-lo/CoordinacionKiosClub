import { jwtVerify } from 'jose';
import { combineChunks, stringFromBase64URL } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

// Supabase JWT secret is base64-encoded in the dashboard — must Buffer.from(..., 'base64').
// Falls back to network validation if not set or if local verification fails.
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET
  ? new Uint8Array(Buffer.from(process.env.SUPABASE_JWT_SECRET, 'base64'))
  : null;

function extractBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

interface JwtPayload {
  sub?: string;
  exp?: number;
  email?: string;
  user_metadata?: { role?: string; full_name?: string; name?: string };
}

async function verifyJwt(token: string): Promise<JwtPayload | null> {
  if (JWT_SECRET) {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      return payload as JwtPayload;
    } catch {
      // Local verification failed (wrong key, expired, etc.) — fall through to network
    }
  }
  // Fallback: network call to Supabase auth (when JWT_SECRET not set OR local verify failed)
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return null;
  return { sub: user.id, email: user.email, user_metadata: user.user_metadata as JwtPayload['user_metadata'] };
}

// Fallback for the many client call sites that use a bare fetch('/api/...')
// without an Authorization header: the browser sends the Supabase session
// cookie automatically, so we read the session from it.
//
// Se lee la cookie A MANO y no con `createServerClient(...).auth.getSession()`, a propósito.
// `getSession()` refresca la sesión si al token le quedan menos de 90 s, y ese refresco GASTA el
// refresh token: Supabase entrega uno nuevo y el viejo queda usado. Acá no hay cómo devolverle al
// navegador el token nuevo (un route handler no reescribe cookies), así que se tiraba. El
// navegador seguía con el viejo, y cuando intentaba refrescar con él Supabase lo tomaba como
// reutilización y revocaba la sesión entera: la persona quedaba fuera, con "errores de conexión",
// justo en los equipos que pasan tiempo dormidos (las handheld de bodega) y vuelven con el token a
// punto de vencer. El refresco es trabajo del navegador y del middleware, que sí guardan el nuevo.
//
// Lo que se acepta es lo mismo que aceptaba `getSession()`: la sesión de la cookie mientras su
// token no haya vencido. Si venció, 401, y el navegador lo refresca solo.
const SESSION_COOKIE = (() => {
  try { return `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`; }
  catch { return null; }
})();

interface CookieSession {
  expires_at?: number;
  user?: { id?: string; email?: string; user_metadata?: JwtPayload['user_metadata'] };
}

/** La sesión guardada en la cookie, sin refrescarla ni validarla contra Supabase. Puro y testeable. */
export async function sessionFromCookies(
  key: string,
  getCookie: (name: string) => string | undefined,
  now: number = Date.now(),
): Promise<JwtPayload | null> {
  const raw = await combineChunks(key, getCookie);
  if (!raw) return null;
  let session: CookieSession;
  try {
    const json = raw.startsWith('base64-') ? stringFromBase64URL(raw.slice('base64-'.length)) : raw;
    session = JSON.parse(json) as CookieSession;
  } catch {
    return null;
  }
  const user = session?.user;
  if (!user?.id) return null;
  if (!session.expires_at || session.expires_at * 1000 <= now) return null;
  return { sub: user.id, email: user.email, user_metadata: user.user_metadata };
}

async function verifyFromCookie(request: NextRequest): Promise<JwtPayload | null> {
  if (!SESSION_COOKIE) return null;
  return sessionFromCookies(SESSION_COOKIE, name => request.cookies.get(name)?.value);
}

/** Resolves the auth payload from the Bearer header, falling back to the session cookie. */
async function resolvePayload(request: NextRequest): Promise<JwtPayload | null> {
  const token = extractBearer(request);
  if (token) {
    const payload = await verifyJwt(token);
    if (payload) return payload;
  }
  return verifyFromCookie(request);
}

/** Returns true if the request belongs to an authenticated user. */
export async function verifyAuth(request: NextRequest): Promise<boolean> {
  return (await resolvePayload(request)) !== null;
}

/** Returns true only if the request belongs to an admin user. */
export async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const payload = await resolvePayload(request);
  return payload?.user_metadata?.role === 'admin';
}

/** Returns the user's id and role, or null if unauthenticated. */
export async function verifyAnyUser(request: NextRequest): Promise<{ id: string; role: string } | null> {
  const payload = await resolvePayload(request);
  if (!payload?.sub) return null;
  return { id: payload.sub, role: payload.user_metadata?.role ?? '' };
}

/**
 * Devuelve el contacto del usuario autenticado (id + email + nombre display), o null.
 * El email sale de la sesión/JWT en el server — nunca del body — para no permitir enviar
 * correos a direcciones arbitrarias (p. ej. la notificación de cambio de contraseña).
 */
export async function verifyUserContact(request: NextRequest): Promise<{ id: string; email: string; name: string } | null> {
  const payload = await resolvePayload(request);
  if (!payload?.sub || !payload.email) return null;
  const name = payload.user_metadata?.full_name?.trim()
    || payload.user_metadata?.name?.trim()
    || payload.email.trim();
  return { id: payload.sub, email: payload.email, name };
}

/**
 * Devuelve el actor autenticado (id + nombre display) para atribuir acciones.
 * El nombre sale del JWT (user_metadata.full_name/name) con fallback a email/id.
 * Fuente de verdad de la atribución en server — no depende de lo que mande el cliente.
 */
export async function verifyActor(request: NextRequest): Promise<{ id: string; name: string } | null> {
  const payload = await resolvePayload(request);
  if (!payload?.sub) return null;
  const name = payload.user_metadata?.full_name?.trim()
    || payload.user_metadata?.name?.trim()
    || payload.email?.trim()
    || payload.sub;
  return { id: payload.sub, name };
}
