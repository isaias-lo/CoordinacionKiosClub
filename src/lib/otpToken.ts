import crypto from 'crypto';

function getSecret(): string {
  const s = process.env.OTP_SECRET;
  if (!s) throw new Error('OTP_SECRET env var is required');
  return s;
}

/** Constant-time string comparison; false if lengths differ (avoids timingSafeEqual throw). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Cuánto vale el token del envío en vivo. No se toca: acá el usuario está frente a la pantalla. */
const VIDA_TOKEN_MS = 10 * 60 * 1000; // 10 min

/**
 * Cuánto vale el COMPROBANTE de que el OTP se verificó, para lo que se manda después sin señal.
 *
 * 72 horas cubre el caso que importa: el chofer confirma la entrega en un subterráneo o en un tramo
 * de ruta sin cobertura, y el teléfono recién encuentra señal mucho rato después — incluso si se
 * queda sin batería y vuelve al día siguiente, o si es viernes por la tarde.
 */
const VIDA_RECIBO_MS = 72 * 60 * 60 * 1000;

/**
 * Separador de dominio del HMAC. Sin esto, la firma de un token de 10 minutos serviría como firma
 * de un comprobante de 72 horas y el límite de arriba no valdría nada.
 */
const DOMINIO_RECIBO = 'recibo-entrega-v1:';

export function createOtpToken(email: string, otp: string): string {
  const exp     = Date.now() + VIDA_TOKEN_MS;
  const payload = Buffer.from(`${email}:${otp}:${exp}`).toString('base64url');
  const sig     = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOtpToken(token: string, email: string, enteredOtp: string): boolean {
  try {
    const dot     = token.lastIndexOf('.');
    if (dot === -1) return false;
    const payload = token.slice(0, dot);
    const sig     = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const decoded = Buffer.from(payload, 'base64url').toString();
    const parts   = decoded.split(':');
    if (parts.length !== 3) return false;
    const [tEmail, tOtp, tExp] = parts;
    if (tEmail !== email)      return false;
    if (!safeEqual(tOtp, enteredOtp)) return false;
    if (Date.now() > parseInt(tExp)) return false;
    return true;
  } catch {
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Comprobante de verificación, para lo que se envía cuando ya no hay señal.
 *
 * El problema que resuelve: el chofer verifica el código con la tienda (eso SÍ necesita señal), y
 * recién después pierde la conexión con las fotos y el PATCH final pendientes. La cola guarda el
 * token del OTP y lo reintenta, pero a los 10 minutos ese token ya no vale: el servidor responde
 * 403, la entrega no se registra nunca y nadie se entera, porque la cola vive en el teléfono.
 *
 * Alargar el token no es la salida: debilitaría la verificación también en el camino en vivo, donde
 * 10 minutos es lo correcto.
 *
 * Este comprobante no afloja ninguna garantía. La tienda participó de verdad, en vivo, con su
 * código: eso ya pasó y no cambia. Lo único que dura más es la PRUEBA de que pasó, y solo para una
 * entrega puntual: va atada a su `alcance` (por ejemplo `ruta_tienda:1234`), así que no se puede
 * reusar para confirmar ninguna otra.
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** `alcance` identifica la entrega concreta que este comprobante habilita, y ninguna otra. */
export function createReciboEntrega(email: string, otp: string, alcance: string): string {
  const exp     = Date.now() + VIDA_RECIBO_MS;
  const payload = Buffer.from(`${email}:${otp}:${exp}:${alcance}`).toString('base64url');
  const sig     = crypto.createHmac('sha256', getSecret()).update(DOMINIO_RECIBO + payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyReciboEntrega(recibo: string, email: string, enteredOtp: string, alcance: string): boolean {
  try {
    const dot = recibo.lastIndexOf('.');
    if (dot === -1) return false;
    const payload  = recibo.slice(0, dot);
    const sig      = recibo.slice(dot + 1);
    const expected = crypto.createHmac('sha256', getSecret()).update(DOMINIO_RECIBO + payload).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    // Ojo con el separador: `alcance` LLEVA dos puntos adentro (`ruta_tienda:1234`), así que no se
    // puede desarmar con un split a secas — quedarían cinco pedazos y nunca validaría nada. Los
    // tres primeros campos no contienen dos puntos; todo lo que viene después del tercero es el
    // alcance, tal cual se firmó.
    const parts = Buffer.from(payload, 'base64url').toString().split(':');
    if (parts.length < 4) return false;
    const [tEmail, tOtp, tExp] = parts;
    const tAlcance = parts.slice(3).join(':');
    if (tEmail !== email) return false;
    if (!safeEqual(tOtp, enteredOtp)) return false;
    if (!safeEqual(tAlcance, alcance)) return false;
    if (Date.now() > parseInt(tExp)) return false;
    return true;
  } catch {
    return false;
  }
}
