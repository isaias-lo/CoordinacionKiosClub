import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/* POST: send password reset email to user after admin approval */
export async function POST(request: NextRequest) {
  const { email } = await request.json() as { email: string };
  if (!email) return NextResponse.json({ error: 'Email requerido' }, { status: 400 });

  const sb = createClient(URL_, ANON, { auth: { persistSession: false } });

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/actualizar-contrasena`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}