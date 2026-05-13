import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SRK  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function adminSb() {
  return createClient(URL_, SRK, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* POST: create pending user */
export async function POST(request: NextRequest) {
  const { full_name, email } = await request.json() as { full_name: string; email: string };
  if (!email || !full_name) return NextResponse.json({ error: 'Nombre y correo requeridos' }, { status: 400 });

  const sb = adminSb();

  const { data: existing } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (existing?.users.some(u => u.email?.toLowerCase() === email.toLowerCase())) {
    return NextResponse.json({ error: 'Este correo ya está registrado' }, { status: 409 });
  }

  const { error } = await sb.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name, role: 'pending' },
  });

  if (error) {
    console.error('[register] createUser error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email });
}