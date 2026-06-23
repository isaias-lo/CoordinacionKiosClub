import { jwtVerify } from 'jose';
import { createServerClient } from '@supabase/ssr';
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
// cookie automatically, so we read the session from it (same source the
// middleware trusts). No-op cookie setter — route handlers only read here.
async function verifyFromCookie(request: NextRequest): Promise<JwtPayload | null> {
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll() { /* read-only in route handlers */ },
      },
    },
  );
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return null;
  return { sub: session.user.id, email: session.user.email, user_metadata: session.user.user_metadata as JwtPayload['user_metadata'] };
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
