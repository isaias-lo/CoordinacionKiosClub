import { NextRequest, NextResponse } from 'next/server';
import { verifyOtpToken } from '@/lib/otpToken';

export async function POST(request: NextRequest) {
  try {
    const { token, email, code } = await request.json() as { token: string; email: string; code: string };

    if (!token || !email || !code) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const valid = verifyOtpToken(token, email, code);
    if (!valid) {
      return NextResponse.json({ error: 'Código incorrecto o expirado' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error al verificar código' }, { status: 500 });
  }
}
