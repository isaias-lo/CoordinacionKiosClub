import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

const URL_  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Verifies the request carries a valid Supabase session token. */
export async function verifyAuth(request: NextRequest): Promise<boolean> {
  const auth = request.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  const sb = createClient(URL_, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } } = await sb.auth.getUser(token);
  return !!user;
}
