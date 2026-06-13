import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendOTPEmail } from '@/lib/gmail';
import { checkRateLimit, getClientIp, tooManyRequests } from '@/lib/rateLimit';

function generateOTP(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** POST — genera OTP y lo envía al correo de la tienda */
export async function POST(request: NextRequest) {
  const { store_cod, store_name } = await request.json() as {
    store_cod: string;
    store_name?: string;
  };

  if (!store_cod) {
    return NextResponse.json({ error: 'store_cod requerido' }, { status: 400 });
  }

  // Anti email-bombing: máx 3 envíos por tienda y por IP cada 10 min.
  // (best-effort en serverless — el store es por instancia; ver rateLimit.ts)
  if (!checkRateLimit(`otp:${store_cod}`, { max: 3 }) ||
      !checkRateLimit(`otp-ip:${getClientIp(request)}`, { max: 3 })) {
    return tooManyRequests();
  }

  // Busca email en Supabase (fuente única de verdad)
  const { data: tienda } = await supabaseServer()
    .from('tiendas')
    .select('correos')
    .eq('codigo', store_cod)
    .single();

  const email = tienda?.correos as string | null;
  if (!email) {
    return NextResponse.json({ error: `No hay correo registrado para ${store_cod}` }, { status: 404 });
  }

  const otp       = generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutos

  // Invalida OTPs anteriores de esta tienda no usados
  await supabaseServer()
    .from('otp_recepcion')
    .update({ used: true })
    .eq('store_cod', store_cod)
    .eq('used', false);

  // Guarda el nuevo OTP
  const { error: dbErr } = await supabaseServer()
    .from('otp_recepcion')
    .insert({ store_cod, otp, expires_at: expiresAt });

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  // Envía el correo
  try {
    await sendOTPEmail(email, store_name ?? store_cod, otp);
  } catch (mailErr) {
    const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
    return NextResponse.json({ error: `Error enviando correo: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email_sent_to: email });
}

/** PUT — valida el OTP ingresado por el conductor */
export async function PUT(request: NextRequest) {
  const { store_cod, otp } = await request.json() as {
    store_cod: string;
    otp: string;
  };

  if (!store_cod || !otp) {
    return NextResponse.json({ error: 'store_cod y otp requeridos' }, { status: 400 });
  }

  // Busca el OTP activo más reciente sin filtrar por código aún (para poder contar intentos)
  const { data: record } = await supabaseServer()
    .from('otp_recepcion')
    .select('id, otp, expires_at, attempts')
    .eq('store_cod', store_cod)
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!record) {
    return NextResponse.json({ valid: false, error: 'Código incorrecto' }, { status: 400 });
  }

  // Rate limiting: máximo 5 intentos por OTP
  const attempts = (record.attempts as number) ?? 0;
  if (attempts >= 5) {
    return NextResponse.json(
      { valid: false, error: 'Demasiados intentos. Solicita un nuevo código.' },
      { status: 429 }
    );
  }

  // Verifica expiración
  if (new Date(record.expires_at as string) < new Date()) {
    return NextResponse.json({ valid: false, error: 'El código ha expirado' }, { status: 400 });
  }

  // Verifica el código
  if (record.otp !== otp.trim()) {
    await supabaseServer()
      .from('otp_recepcion')
      .update({ attempts: attempts + 1 })
      .eq('id', record.id);
    const remaining = 4 - attempts;
    return NextResponse.json(
      { valid: false, error: `Código incorrecto. ${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''}.` },
      { status: 400 }
    );
  }

  // Código correcto — marca como usado
  await supabaseServer()
    .from('otp_recepcion')
    .update({ used: true })
    .eq('id', record.id);

  return NextResponse.json({ valid: true });
}
