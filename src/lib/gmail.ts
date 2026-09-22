import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

export async function sendOTPEmail(to: string, storeName: string, otp: string, origin?: string): Promise<void> {
  // Logo REAL servido desde el mismo dominio (igual que el manifiesto: `${origin}/logo-kiosclub.webp`).
  // Si no se pasa origin, cae al logo de texto para no romper el correo.
  // logo-kiosclub-email.webp = versión con fondo BLANCO pegado (sin alpha): el logo normal es
  // transparente y Gmail lo compone sobre NEGRO. Este aplanado evita el recuadro negro.
  const logoHtml = origin
    ? `<img src="${origin}/logo-kiosclub-email.webp" alt="KIOS Club — American Supermarket" width="200" style="max-width:200px;height:auto;display:inline-block;border-radius:8px;" />`
    : `<span style="font-size:32px;font-weight:900;color:#C62828;letter-spacing:-1px;">KIOS<span style="font-style:italic;">Club</span></span>`;
  await transporter.sendMail({
    from: `"KiosClub Despacho" <${process.env.GMAIL_USER}>`,
    to,
    subject: `Código de recepción: ${otp} — KiosClub`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8faff; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 28px;">${logoHtml}</div>

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

/**
 * [Panel Conductor · Fase 6] Comprobante de entrega — mismo patrón que Onfleet/Amazon Flex: la
 * tienda recibe automáticamente un resumen apenas se confirma, sin tener que pedirlo. Se manda al
 * MISMO correo que ya validó el OTP (no a `body.correos` de nuevo): es la prueba de que esa
 * bandeja específica confirmó esta entrega puntual.
 *
 * Fire-and-forget desde el caller — un fallo de correo no debe hacer fallar la entrega, que ya
 * quedó guardada en la base antes de intentar esto.
 */
export async function sendComprobanteEntregaEmail(a: {
  to: string; storeCod: string; storeName?: string | null;
  receptor: string; horaISO: string; observaciones?: string | null; fotoUrls: string[];
  origin?: string;
}): Promise<void> {
  const hora = new Date(a.horaISO).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'medium', timeStyle: 'short' });
  const logoHtml = a.origin
    ? `<img src="${a.origin}/logo-kiosclub-email.webp" alt="KIOS Club — American Supermarket" width="200" style="max-width:200px;height:auto;display:inline-block;border-radius:8px;" />`
    : `<span style="font-size:32px;font-weight:900;color:#C62828;letter-spacing:-1px;">KIOS<span style="font-style:italic;">Club</span></span>`;
  const fotosHtml = a.fotoUrls.length
    ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${a.fotoUrls.map(u => `<img src="${u}" alt="Evidencia de entrega" width="120" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #E2E8F0;" />`).join('')}
      </div>`
    : '';
  await transporter.sendMail({
    from: `"KiosClub Despacho" <${process.env.GMAIL_USER}>`,
    to: a.to,
    subject: `Comprobante de entrega — ${a.storeName ?? a.storeCod}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #f8faff; border-radius: 16px;">
        <div style="text-align: center; margin-bottom: 28px;">${logoHtml}</div>

        <div style="background: #DCFCE7; border-radius: 12px; padding: 20px 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 15px; font-weight: 800; color: #16A34A;">✓ Entrega confirmada</p>
          <p style="margin: 4px 0 0; font-size: 13px; color: #15803D;">${a.storeName ?? a.storeCod} (${a.storeCod})</p>
        </div>

        <table style="width:100%; font-size: 13px; color: #374151; border-collapse: collapse;">
          <tr><td style="padding: 4px 0; color: #9CA3AF;">Hora</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${hora}</td></tr>
          <tr><td style="padding: 4px 0; color: #9CA3AF;">Recibió</td><td style="padding: 4px 0; text-align: right; font-weight: 600;">${a.receptor}</td></tr>
          ${a.observaciones ? `<tr><td style="padding: 4px 0; color: #9CA3AF;">Observaciones</td><td style="padding: 4px 0; text-align: right;">${a.observaciones}</td></tr>` : ''}
        </table>
        ${fotosHtml}

        <p style="font-size: 12px; color: #9CA3AF; margin: 20px 0 0;">
          Este correo se genera automáticamente al confirmar la entrega. Si algo no corresponde, contacta a tu supervisor de KiosClub.
        </p>
      </div>
    `,
  });
}
