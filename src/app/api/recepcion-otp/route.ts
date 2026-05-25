import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { sendOTPEmail } from '@/lib/gmail';
import { TIENDA_EMAILS } from '@/lib/tiendaEmails';

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

  const email = TIENDA_EMAILS[store_cod];
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

  const { data, error } = await supabaseServer()
    .from('otp_recepcion')
    .select('id, expires_at, used')
    .eq('store_cod', store_cod)
    .eq('otp', otp.trim())
    .eq('used', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ valid: false, error: 'Código incorrecto' }, { status: 400 });
  }

  if (new Date(data.expires_at as string) < new Date()) {
    return NextResponse.json({ valid: false, error: 'El código ha expirado' }, { status: 400 });
  }

  // Marca como usado
  await supabaseServer()
    .from('otp_recepcion')
    .update({ used: true })
    .eq('id', data.id);

  return NextResponse.json({ valid: true });
}
