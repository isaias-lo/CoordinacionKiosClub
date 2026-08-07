import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { verifyUserContact } from '@/lib/apiAuth';
import { buildPasswordChangedEmail, formatWhenCL } from '@/lib/emails/passwordChanged';

// Notificación de seguridad tras un cambio de contraseña. El destinatario SIEMPRE es el email
// del usuario autenticado (de la sesión/JWT), nunca del body → no se puede spamear a terceros.
export async function POST(request: NextRequest) {
  const user = await verifyUserContact(request);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASS;
  if (!gmailUser || !gmailPass)
    return NextResponse.json({ error: 'Email no configurado (GMAIL_USER / GMAIL_APP_PASS)' }, { status: 503 });

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002').replace(/\/$/, '');
  const { subject, html } = buildPasswordChangedEmail(user.name, formatWhenCL(new Date()), appUrl);

  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: gmailUser, pass: gmailPass } });
    await transporter.sendMail({ from: `KiosClub <${gmailUser}>`, to: user.email, subject, html });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[password-changed-email]', e);
    return NextResponse.json({ error: 'No se pudo enviar el correo' }, { status: 500 });
  }
}
