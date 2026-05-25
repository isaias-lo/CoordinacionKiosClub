import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

export async function sendOTPEmail(to: string, storeName: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: `"KiosClub Despacho" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Código de recepción: ${otp} — KiosClub`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8faff; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <span style="font-size: 32px; font-weight: 900; color: #C62828; letter-spacing: -1px;">
            KIOS<span style="font-style: italic;">Club</span>
          </span>
        </div>

        <div style="background: #1B2A6B; border-radius: 12px; padding: 28px 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 2px;">Código de recepción</p>
          <div style="font-size: 52px; font-weight: 900; color: #fff; letter-spacing: 10px; margin: 8px 0;">${otp}</div>
          <p style="margin: 8px 0 0; font-size: 12px; color: rgba(255,255,255,0.45);">Válido por 10 minutos</p>
        </div>

        <p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 16px;">
          El conductor de <strong>KiosClub</strong> está realizando la entrega en <strong>${storeName}</strong>.
          Entrégale este código de 6 dígitos para confirmar la recepción.
        </p>

        <p style="font-size: 12px; color: #9CA3AF; margin: 0;">
          Si no esperabas esta entrega, ignora este mensaje o contacta a tu supervisor.
        </p>
      </div>
    `,
  });
}
