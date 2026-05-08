import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createOtpToken } from '../../../lib/otpToken';

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { email, cod, tienda } = await request.json() as {
      email: string;
      cod: string;
      tienda: string;
    };

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Email inválido' }, { status: 400 });
    }

    const otp   = Math.floor(100000 + Math.random() * 900000).toString();
    const token = createOtpToken(email, otp);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#f8fafc;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
        <div style="background:#1B2A6B;padding:28px 24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:3px;font-weight:900">KIOSCLUB</h1>
          <p style="color:rgba(255,255,255,0.55);margin:6px 0 0;font-size:13px">Sistema de Despacho</p>
        </div>
        <div style="padding:36px 28px">
          <h2 style="color:#1F2937;font-size:19px;margin:0 0 8px;font-weight:700">Código de verificación</h2>
          <p style="color:#6B7280;font-size:14px;margin:0 0 28px;line-height:1.5">
            Para confirmar la recepción del despacho en<br>
            <strong style="color:#1B2A6B;font-size:16px">${tienda} (${cod})</strong>
          </p>
          <div style="background:#EEF2FF;border-radius:14px;padding:24px;text-align:center;margin-bottom:28px">
            <span style="font-size:44px;font-weight:900;letter-spacing:14px;color:#1B2A6B;font-family:monospace">${otp}</span>
          </div>
          <p style="color:#9CA3AF;font-size:12px;text-align:center;margin:0">
            Este código expira en <strong>10 minutos</strong>.<br>
            Si no solicitaste este código, ignora este correo.
          </p>
        </div>
      </div>`;

    await getTransporter().sendMail({
      from: `"KiosClub Despacho" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `${otp} — Código de recepción KiosClub`,
      html,
    });

    return NextResponse.json({ token });
  } catch (err) {
    console.error('send-otp error:', err);
    return NextResponse.json({ error: 'No se pudo enviar el correo' }, { status: 500 });
  }
}
