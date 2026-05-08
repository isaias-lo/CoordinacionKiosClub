import crypto from 'crypto';

const SECRET = process.env.OTP_SECRET || 'kiosclub-otp-secret-change-in-prod';

export function createOtpToken(email: string, otp: string): string {
  const exp     = Date.now() + 10 * 60 * 1000; // 10 min
  const payload = Buffer.from(`${email}:${otp}:${exp}`).toString('base64url');
  const sig     = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyOtpToken(token: string, email: string, enteredOtp: string): boolean {
  try {
    const dot     = token.lastIndexOf('.');
    if (dot === -1) return false;
    const payload = token.slice(0, dot);
    const sig     = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
    if (sig !== expected) return false;
    const decoded = Buffer.from(payload, 'base64url').toString();
    const parts   = decoded.split(':');
    if (parts.length !== 3) return false;
    const [tEmail, tOtp, tExp] = parts;
    if (tEmail !== email)      return false;
    if (tOtp   !== enteredOtp) return false;
    if (Date.now() > parseInt(tExp)) return false;
    return true;
  } catch {
    return false;
  }
}
