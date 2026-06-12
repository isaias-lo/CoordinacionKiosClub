import { jwtVerify } from 'jose';
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
  user_metadata?: { role?: string };
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
  return { sub: user.id, user_metadata: user.user_metadata as { role?: string } };
}

/** Returns true if the token belongs to an authenticated user. */
export async function verifyAuth(request: NextRequest): Promise<boolean> {
  const token = extractBearer(request);
  if (!token) return false;
  return (await verifyJwt(token)) !== null;
}

/** Returns true only if the token belongs to an admin user. */
export async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const token = extractBearer(request);
  if (!token) return false;
  const payload = await verifyJwt(token);
  return payload?.user_metadata?.role === 'admin';
}

/** Returns the user's id and role, or null if unauthenticated. */
export async function verifyAnyUser(request: NextRequest): Promise<{ id: string; role: string } | null> {
  const token = extractBearer(request);
  if (!token) return null;
  const payload = await verifyJwt(token);
  if (!payload?.sub) return null;
  return { id: payload.sub, role: payload.user_metadata?.role ?? '' };
}
