import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { SignJWT } from 'jose';
import { NextRequest } from 'next/server';

// Use a 32-byte test key. The env var is the base64 of raw key bytes,
// matching exactly how apiAuth.ts decodes it: Buffer.from(secret, 'base64').
const RAW_KEY = Buffer.from('kiosclub-vitest-test-secret-key!');  // 32 bytes
const B64_KEY = RAW_KEY.toString('base64');

async function signToken(payload: object, expiresIn = '1h'): Promise<string> {
  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new Uint8Array(RAW_KEY));
}

function makeReq(authHeader?: string): NextRequest {
  const headers: Record<string, string> = authHeader ? { authorization: authHeader } : {};
  return new NextRequest('http://localhost/api/test', { headers });
}

// Prevent real Supabase network calls in the fallback path
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
  })),
}));

// Cookie fallback: no session cookie present in test requests → null session.
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  })),
}));

let verifyAuth:    (r: NextRequest) => Promise<boolean>;
let verifyAdmin:   (r: NextRequest) => Promise<boolean>;
let verifyAnyUser: (r: NextRequest) => Promise<{ id: string; role: string } | null>;
let verifyActor:   (r: NextRequest) => Promise<{ id: string; name: string } | null>;

beforeAll(async () => {
  // Must stub env BEFORE importing apiAuth — JWT_SECRET is read at module init
  vi.stubEnv('SUPABASE_JWT_SECRET', B64_KEY);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  vi.resetModules();
  const mod = await import('../apiAuth');
  verifyAuth    = mod.verifyAuth;
  verifyAdmin   = mod.verifyAdmin;
  verifyAnyUser = mod.verifyAnyUser;
  verifyActor   = mod.verifyActor;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

// ─── verifyAuth ───────────────────────────────────────────────────────────────

describe('verifyAuth', () => {
  it('returns false when no Authorization header', async () => {
    expect(await verifyAuth(makeReq())).toBe(false);
  });

  it('returns false when Authorization is not Bearer', async () => {
    expect(await verifyAuth(makeReq('Basic abc123'))).toBe(false);
  });

  it('returns true for a valid JWT signed with the correct secret', async () => {
    const token = await signToken({ sub: 'user-123' });
    expect(await verifyAuth(makeReq(`Bearer ${token}`))).toBe(true);
  });

  it('returns false for an expired JWT (no valid network fallback in tests)', async () => {
    const token = await signToken({ sub: 'user-123' }, '-1s');
    expect(await verifyAuth(makeReq(`Bearer ${token}`))).toBe(false);
  });

  it('returns false for a JWT signed with the wrong key', async () => {
    const wrongKey = Buffer.from('wrong-key-that-does-not-match!!');
    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new Uint8Array(wrongKey));
    expect(await verifyAuth(makeReq(`Bearer ${token}`))).toBe(false);
  });
});

// ─── verifyAdmin ──────────────────────────────────────────────────────────────

describe('verifyAdmin', () => {
  it('returns false when no token', async () => {
    expect(await verifyAdmin(makeReq())).toBe(false);
  });

  it('returns true for a JWT with role=admin', async () => {
    const token = await signToken({ sub: 'admin-1', user_metadata: { role: 'admin' } });
    expect(await verifyAdmin(makeReq(`Bearer ${token}`))).toBe(true);
  });

  it('returns false for a JWT with role=despachador', async () => {
    const token = await signToken({ sub: 'user-1', user_metadata: { role: 'despachador' } });
    expect(await verifyAdmin(makeReq(`Bearer ${token}`))).toBe(false);
  });

  it('returns false for a JWT with no user_metadata', async () => {
    const token = await signToken({ sub: 'user-1' });
    expect(await verifyAdmin(makeReq(`Bearer ${token}`))).toBe(false);
  });
});

// ─── verifyAnyUser ────────────────────────────────────────────────────────────

describe('verifyAnyUser', () => {
  it('returns null when no token', async () => {
    expect(await verifyAnyUser(makeReq())).toBeNull();
  });

  it('returns id and role from a valid JWT', async () => {
    const token = await signToken({ sub: 'user-xyz', user_metadata: { role: 'auditor' } });
    const result = await verifyAnyUser(makeReq(`Bearer ${token}`));
    expect(result).toEqual({ id: 'user-xyz', role: 'auditor' });
  });

  it('returns empty role string when user_metadata has no role', async () => {
    const token = await signToken({ sub: 'user-xyz' });
    const result = await verifyAnyUser(makeReq(`Bearer ${token}`));
    expect(result).toEqual({ id: 'user-xyz', role: '' });
  });

  it('returns null for expired token', async () => {
    const token = await signToken({ sub: 'user-xyz' }, '-1s');
    expect(await verifyAnyUser(makeReq(`Bearer ${token}`))).toBeNull();
  });
});

// ─── verifyActor (atribución desde el JWT) ──────────────────────────────────────

describe('verifyActor', () => {
  it('returns null when no token', async () => {
    expect(await verifyActor(makeReq())).toBeNull();
  });

  it('uses user_metadata.full_name as the actor name', async () => {
    const token = await signToken({ sub: 'u1', user_metadata: { full_name: 'Luis Cortez' } });
    expect(await verifyActor(makeReq(`Bearer ${token}`))).toEqual({ id: 'u1', name: 'Luis Cortez' });
  });

  it('falls back to user_metadata.name, then email, then sub', async () => {
    const t1 = await signToken({ sub: 'u2', user_metadata: { name: 'Camila' } });
    expect((await verifyActor(makeReq(`Bearer ${t1}`)))?.name).toBe('Camila');

    const t2 = await signToken({ sub: 'u3', email: 'erick@kios.cl' });
    expect((await verifyActor(makeReq(`Bearer ${t2}`)))?.name).toBe('erick@kios.cl');

    const t3 = await signToken({ sub: 'u4' });
    expect((await verifyActor(makeReq(`Bearer ${t3}`)))?.name).toBe('u4'); // degrada al id
  });

  it('returns null for expired token', async () => {
    const token = await signToken({ sub: 'u5', user_metadata: { full_name: 'X' } }, '-1s');
    expect(await verifyActor(makeReq(`Bearer ${token}`))).toBeNull();
  });
});
