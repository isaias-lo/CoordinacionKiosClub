import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/* POST: verify OTP code + mark user email confirmed */
export async function POST(request: NextRequest) {
  if (!checkRateLimit(`verifyotp:${getClientIp(request)}`, { max: 10, windowMs: 600_000 }))
    return tooManyRequests();

  const { email, token } = await request.json() as { email: string; token: string };
  if (!email || !token) return NextResponse.json({ error: 'Email y código requeridos' }, { status: 400 });

  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });

  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const role = (data.user?.user_metadata?.role as string) ?? 'pending';
  return NextResponse.json({ ok: true, role });
}