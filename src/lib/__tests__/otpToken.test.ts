import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { createOtpToken, verifyOtpToken, createReciboEntrega, verifyReciboEntrega } from '../otpToken';

const TEST_SECRET = 'kiosclub-otp-test-secret-vitest';
const EMAIL = 'test@kiosclub.com';
const OTP   = '123456';

beforeAll(() => {
  process.env.OTP_SECRET = TEST_SECRET;
});

// ─── createOtpToken ───────────────────────────────────────────────────────────

describe('createOtpToken', () => {
  it('returns a string with exactly one dot separator', () => {
    const token = createOtpToken(EMAIL, OTP);
    const dots = (token.match(/\./g) || []).length;
    expect(dots).toBe(1);
  });

  it('payload is base64url-decodable and contains email:otp:exp', () => {
    const token   = createOtpToken(EMAIL, OTP);
    const payload = token.split('.')[0];
    const decoded = Buffer.from(payload, 'base64url').toString();
    const parts   = decoded.split(':');
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(EMAIL);
    expect(parts[1]).toBe(OTP);
    expect(Number(parts[2])).toBeGreaterThan(Date.now());
  });

  it('expiry is approximately 10 minutes from now', () => {
    const before  = Date.now();
    const token   = createOtpToken(EMAIL, OTP);
    const payload = token.split('.')[0];
    const decoded = Buffer.from(payload, 'base64url').toString();
    const exp     = Number(decoded.split(':')[2]);
    const after   = Date.now();
    const TEN_MIN = 10 * 60 * 1000;
    expect(exp).toBeGreaterThanOrEqual(before + TEN_MIN - 100);
    expect(exp).toBeLessThanOrEqual(after  + TEN_MIN + 100);
  });

  it('produces a different token each call (due to different expiry timestamp)', async () => {
    const t1 = createOtpToken(EMAIL, OTP);
    await new Promise(r => setTimeout(r, 2)); // 2ms gap ensures different ms timestamp
    const t2 = createOtpToken(EMAIL, OTP);
    expect(t1).not.toBe(t2);
  });

  it('throws if OTP_SECRET is not set', () => {
    const saved = process.env.OTP_SECRET;
    delete process.env.OTP_SECRET;
    expect(() => createOtpToken(EMAIL, OTP)).toThrow('OTP_SECRET');
    process.env.OTP_SECRET = saved;
  });
});

// ─── verifyOtpToken ───────────────────────────────────────────────────────────

describe('verifyOtpToken', () => {
  it('returns true for a freshly created token', () => {
    const token = createOtpToken(EMAIL, OTP);
    expect(verifyOtpToken(token, EMAIL, OTP)).toBe(true);
  });

  it('returns false for wrong email', () => {
    const token = createOtpToken(EMAIL, OTP);
    expect(verifyOtpToken(token, 'other@kiosclub.com', OTP)).toBe(false);
  });

  it('returns false for wrong OTP', () => {
    const token = createOtpToken(EMAIL, OTP);
    expect(verifyOtpToken(token, EMAIL, '999999')).toBe(false);
  });

  it('returns false for a tampered signature', () => {
    const token = createOtpToken(EMAIL, OTP);
    const [payload] = token.split('.');
    const tampered  = `${payload}.invalidsignature`;
    expect(verifyOtpToken(tampered, EMAIL, OTP)).toBe(false);
  });

  it('returns false for a tampered payload (valid sig but wrong content)', () => {
    // Build a token with modified email but re-signed with the correct secret
    const badEmail  = 'attacker@evil.com';
    const exp       = Date.now() + 10 * 60 * 1000;
    const payload   = Buffer.from(`${badEmail}:${OTP}:${exp}`).toString('base64url');
    const sig       = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
    const fakeToken = `${payload}.${sig}`;
    // The token is valid for badEmail but we verify against EMAIL — must fail
    expect(verifyOtpToken(fakeToken, EMAIL, OTP)).toBe(false);
  });

  it('returns false for an expired token', () => {
    // Manually construct an expired token (valid signature, past expiry)
    const exp     = Date.now() - 1000; // 1 second ago
    const payload = Buffer.from(`${EMAIL}:${OTP}:${exp}`).toString('base64url');
    const sig     = crypto.createHmac('sha256', TEST_SECRET).update(payload).digest('base64url');
    expect(verifyOtpToken(`${payload}.${sig}`, EMAIL, OTP)).toBe(false);
  });

  it('returns false for a token with no dot separator', () => {
    expect(verifyOtpToken('nodottoken', EMAIL, OTP)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(verifyOtpToken('', EMAIL, OTP)).toBe(false);
  });

  it('returns false for malformed payload (not 3 parts)', () => {
    const badPayload = Buffer.from('onlytwoparts:123').toString('base64url');
    const sig        = crypto.createHmac('sha256', TEST_SECRET).update(badPayload).digest('base64url');
    expect(verifyOtpToken(`${badPayload}.${sig}`, EMAIL, OTP)).toBe(false);
  });
});

// ─── createReciboEntrega / verifyReciboEntrega ────────────────────────────────
//
// El comprobante existe por un bug real: la cola offline del conductor guardaba el token del OTP y
// lo reintentaba, pero ese token vive 10 minutos. Una entrega confirmada sin señal que tardaba más
// en sincronizar recibía un 403 y se perdía en silencio. Ver `createReciboEntrega` en ../otpToken.

describe('verifyReciboEntrega', () => {
  const ALCANCE = 'ruta_tienda:1234';

  it('acepta el comprobante recién emitido para su propia entrega', () => {
    const recibo = createReciboEntrega(EMAIL, OTP, ALCANCE);
    expect(verifyReciboEntrega(recibo, EMAIL, OTP, ALCANCE)).toBe(true);
  });

  it('NO sirve para otra entrega — es lo que impide reusarlo', () => {
    // Sin esto, un comprobante de 72 horas serviría para confirmar cualquier parada del día.
    const recibo = createReciboEntrega(EMAIL, OTP, ALCANCE);
    expect(verifyReciboEntrega(recibo, EMAIL, OTP, 'ruta_tienda:9999')).toBe(false);
  });

  it('rechaza otro correo u otro código', () => {
    const recibo = createReciboEntrega(EMAIL, OTP, ALCANCE);
    expect(verifyReciboEntrega(recibo, 'otra@tienda.cl', OTP, ALCANCE)).toBe(false);
    expect(verifyReciboEntrega(recibo, EMAIL, '999999', ALCANCE)).toBe(false);
  });

  it('rechaza una firma alterada', () => {
    const recibo = createReciboEntrega(EMAIL, OTP, ALCANCE);
    const [payload] = recibo.split('.');
    expect(verifyReciboEntrega(`${payload}.firmaInventada`, EMAIL, OTP, ALCANCE)).toBe(false);
  });

  it('rechaza basura sin reventar', () => {
    expect(verifyReciboEntrega('', EMAIL, OTP, ALCANCE)).toBe(false);
    expect(verifyReciboEntrega('sin-punto', EMAIL, OTP, ALCANCE)).toBe(false);
  });

  it('vence, pero mucho después que el token de 10 minutos', () => {
    const recibo = createReciboEntrega(EMAIL, OTP, ALCANCE);
    const token  = createOtpToken(EMAIL, OTP);
    const ahora  = Date.now();

    const enMinutos = (m: number) => new Date(ahora + m * 60_000);
    vi.useFakeTimers();
    try {
      // A los 30 minutos el token ya murió, que es exactamente el caso que perdía entregas.
      vi.setSystemTime(enMinutos(30));
      expect(verifyOtpToken(token, EMAIL, OTP)).toBe(false);
      expect(verifyReciboEntrega(recibo, EMAIL, OTP, ALCANCE)).toBe(true);

      // Al día siguiente sigue valiendo: el teléfono pudo quedarse sin batería en plena ruta.
      vi.setSystemTime(enMinutos(24 * 60));
      expect(verifyReciboEntrega(recibo, EMAIL, OTP, ALCANCE)).toBe(true);

      // Pero no es eterno.
      vi.setSystemTime(enMinutos(73 * 60));
      expect(verifyReciboEntrega(recibo, EMAIL, OTP, ALCANCE)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('los dos formatos no se cruzan', () => {
  const ALCANCE = 'ruta_tienda:1234';

  it('un token de 10 minutos no pasa como comprobante de 72 horas', () => {
    // Si pasara, el límite corto del token en vivo no valdría nada: bastaría con presentarlo por
    // el otro camino. Por eso las dos firmas se calculan sobre dominios distintos.
    const token = createOtpToken(EMAIL, OTP);
    expect(verifyReciboEntrega(token, EMAIL, OTP, ALCANCE)).toBe(false);
  });

  it('un comprobante no pasa como token del camino en vivo', () => {
    const recibo = createReciboEntrega(EMAIL, OTP, ALCANCE);
    expect(verifyOtpToken(recibo, EMAIL, OTP)).toBe(false);
  });
});
