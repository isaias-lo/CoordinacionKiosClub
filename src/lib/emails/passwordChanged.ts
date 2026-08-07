/* ── Correo de seguridad: "tu contraseña fue cambiada" ────────────────────────
   Builder PURO (sin red) del asunto + HTML, para poder testearlo. El envío real lo
   hace el endpoint /api/auth/password-changed-email con nodemailer. */

export interface PasswordChangedEmail { subject: string; html: string }

/** Formatea un instante a fecha/hora de Chile legible (es-CL). */
export function formatWhenCL(date: Date): string {
  return date.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

// Escapa texto que va dentro del HTML (nombre del usuario) para evitar inyección.
function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/**
 * Construye el correo de notificación de cambio de contraseña.
 * @param name    Nombre (o email) del usuario.
 * @param whenLabel  Fecha/hora legible del cambio (ver formatWhenCL).
 * @param appUrl  URL base de la app (para el enlace de soporte/login).
 */
export function buildPasswordChangedEmail(name: string, whenLabel: string, appUrl: string): PasswordChangedEmail {
  const nombre = esc(name || 'usuario');
  const cuando = esc(whenLabel);
  const url = appUrl.replace(/\/$/, '');
  return {
    subject: 'Tu contraseña fue cambiada — KiosClub',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #111A3E; font-size: 28px; margin: 0;">KiosClub</h1>
          <p style="color: #666; font-size: 14px;">Sistema de despacho</p>
        </div>
        <div style="background: #f5f7fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <h2 style="color: #111A3E; font-size: 20px; margin: 0 0 16px 0;">Tu contraseña fue cambiada</h2>
          <p style="color: #333; font-size: 15px; margin: 0 0 12px 0;">
            Hola <strong>${nombre}</strong>, te confirmamos que la contraseña de tu cuenta KiosClub
            se cambió el <strong>${cuando}</strong>.
          </p>
          <p style="color: #333; font-size: 15px; margin: 0;">
            Si <strong>fuiste tú</strong>, no tienes que hacer nada.
          </p>
        </div>
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 18px; margin-bottom: 24px;">
          <p style="color: #991B1B; font-size: 14px; margin: 0; font-weight: 600;">¿No reconoces este cambio?</p>
          <p style="color: #7f1d1d; font-size: 14px; margin: 8px 0 0 0;">
            Contacta de inmediato al administrador del sistema para asegurar tu cuenta.
          </p>
        </div>
        <div style="text-align: center;">
          <a href="${url}/login" style="display: inline-block; background: #111A3E; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-size: 15px; font-weight: 600;">Ir a KiosClub</a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 24px;">
          Este es un aviso de seguridad automático. No respondas a este correo.
        </p>
      </div>
    `.trim(),
  };
}
