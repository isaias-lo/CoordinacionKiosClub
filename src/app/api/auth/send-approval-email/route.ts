import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER!,
    pass: process.env.GMAIL_APP_PASS!,
  },
});

const ROLE_LABEL: Record<string, string> = {
  auditor:           'Auditor',
  'admin-auditoria': 'Admin Auditoría',
  despachador:       'Despachador',
  supervisor:        'Supervisor',
  admin:             'Administrador',
};

export async function POST(request: NextRequest) {
  const { email, full_name, password, role } = await request.json() as {
    email: string;
    full_name: string;
    password: string;
    role: string;
  };

  if (!email || !password) {
    return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002').replace(/\/$/, '');

  try {
    await transporter.sendMail({
      from: `KiosClub <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Tu cuenta fue aprobada - KiosClub',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #111A3E; font-size: 28px; margin: 0;">KiosClub</h1>
            <p style="color: #666; font-size: 14px;">Sistema de despacho</p>
          </div>

          <div style="background: #f5f7fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <h2 style="color: #111A3E; font-size: 20px; margin: 0 0 16px 0;">¡Cuenta aprobada!</h2>
            <p style="color: #333; font-size: 15px; margin: 0 0 16px 0;">
              Hola <strong>${full_name || email}</strong>, tu cuenta fue aprobada con el rol de
              <strong>${ROLE_LABEL[role] ?? role}</strong>.
            </p>
            <p style="color: #333; font-size: 15px; margin: 0;">
              Ingresa a la app con tu correo y la contraseña temporal que aparece abajo.
              Te recomendamos cambiarla después de iniciar sesión.
            </p>
          </div>

          <div style="background: #111A3E; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px;">Contraseña temporal</p>
            <p style="color: #fff; font-size: 28px; font-family: monospace; font-weight: bold; margin: 0; letter-spacing: 2px;">${password}</p>
          </div>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${appUrl}/login"
               style="display: inline-block; background: #2563EB; color: #fff; text-decoration: none;
                      padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: bold;">
              Ingresar a KiosClub
            </a>
          </div>

          <p style="color: #888; font-size: 13px; text-align: center; margin: 0;">
            Si no solicitaste esta cuenta, ignora este email.
          </p>
        </div>
      `,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[send-approval-email] Error:', msg);
    return NextResponse.json({ error: `Error al enviar email: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
