import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function authSb() {
  return createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
}

function extractBearer(request: NextRequest): string | null {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

/** Verifies the request carries a valid Supabase session token. */
export async function verifyAuth(request: NextRequest): Promise<boolean> {
  const token = extractBearer(request);
  if (!token) return false;
  const { data: { user } } = await authSb().auth.getUser(token);
  return !!user;
}

/** Returns true only if the token belongs to an admin user. */
export async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const token = extractBearer(request);
  if (!token) return false;
  const { data: { user } } = await authSb().auth.getUser(token);
  return user?.user_metadata?.role === 'admin';
}

/** Returns the user's id and role, or null if unauthenticated. */
export async function verifyAnyUser(request: NextRequest): Promise<{ id: string; role: string } | null> {
  const token = extractBearer(request);
  if (!token) return null;
  const { data: { user } } = await authSb().auth.getUser(token);
  if (!user) return null;
  return { id: user.id, role: (user.user_metadata?.role as string) ?? '' };
}
