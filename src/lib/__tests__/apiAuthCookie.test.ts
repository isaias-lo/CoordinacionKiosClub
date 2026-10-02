import { describe, it, expect, vi } from 'vitest';
import { createChunks, stringToBase64URL } from '@supabase/ssr';

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
const { sessionFromCookies } = await import('../apiAuth');

const KEY = 'sb-abc-auth-token';
const NOW = 1_800_000_000_000;

function cookies(session: object, chunkSize?: number): (name: string) => string | undefined {
  const value = 'base64-' + stringToBase64URL(JSON.stringify(session));
  const jar = new Map(createChunks(KEY, value, chunkSize).map(c => [c.name, c.value]));
  return name => jar.get(name);
}

const user = { id: 'u1', email: 'a@b.cl', user_metadata: { role: 'asistente-despacho' } };

describe('sessionFromCookies', () => {
  it('lee la sesión vigente de la cookie', async () => {
    const s = await sessionFromCookies(KEY, cookies({ expires_at: NOW / 1000 + 60, user }), NOW);
    expect(s).toEqual({ sub: 'u1', email: 'a@b.cl', user_metadata: { role: 'asistente-despacho' } });
  });

  it('arma la sesión aunque venga partida en varias cookies', async () => {
    const s = await sessionFromCookies(KEY, cookies({ expires_at: NOW / 1000 + 60, user }, 40), NOW);
    expect(s?.sub).toBe('u1');
  });

  it('rechaza un token vencido en vez de refrescarlo', async () => {
    expect(await sessionFromCookies(KEY, cookies({ expires_at: NOW / 1000 - 1, user }), NOW)).toBeNull();
  });

  it('sin cookie o con basura devuelve null', async () => {
    expect(await sessionFromCookies(KEY, () => undefined, NOW)).toBeNull();
    expect(await sessionFromCookies(KEY, n => (n === KEY ? 'base64-%%%' : undefined), NOW)).toBeNull();
    expect(await sessionFromCookies(KEY, n => (n === KEY ? '{}' : undefined), NOW)).toBeNull();
  });
});
