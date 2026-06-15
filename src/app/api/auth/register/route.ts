import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit';
import { parseBody, RegisterSchema } from '@/lib/schemas';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminSb() {
  return createClient(URL_, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* POST: create pending user */
export async function POST(request: NextRequest) {
  if (!checkRateLimit(`register:${getClientIp(request)}`, { max: 5, windowMs: 3_600_000 }))
    return tooManyRequests();

  const raw = await request.json();
  const parsed = parseBody(RegisterSchema, raw);
  if (!parsed.ok) return parsed.response;
  const { full_name, email } = parsed.data;

  const sb = adminSb();

  const { error } = await sb.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name, role: 'pending' },
  });

  if (error) {
    // Supabase returns "already registered" / status 422 for duplicate emails
    if (error.status === 422 || error.message.toLowerCase().includes('already registered')) {
      return NextResponse.json({ error: 'Este correo ya está registrado' }, { status: 409 });
    }
    console.error('[register] createUser error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}