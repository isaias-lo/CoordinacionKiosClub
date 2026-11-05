import { describe, it, expect, vi, afterEach } from 'vitest';
import { llevaKeepalive, pedirKeepalive, fetchConKeepalive, VENTANA_KEEPALIVE_MS } from '../subidaAlCerrar';

describe('llevaKeepalive', () => {
  it('una escritura dentro de la ventana sí', () => {
    expect(llevaKeepalive('POST', 1000, 2000)).toBe(true);
    expect(llevaKeepalive('patch', 1000, 2000)).toBe(true);
  });
  it('fuera de la ventana no', () => {
    expect(llevaKeepalive('POST', 2000, 2000)).toBe(false);
  });
  it('una lectura no', () => {
    expect(llevaKeepalive('GET', 1000, 2000)).toBe(false);
    expect(llevaKeepalive(undefined, 1000, 2000)).toBe(false);
  });
});

describe('fetchConKeepalive', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('tras pedirKeepalive, la escritura sale con keepalive', async () => {
    const f = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', f);
    pedirKeepalive();
    await fetchConKeepalive('https://x/rest', { method: 'POST', body: '{}' });
    expect(f.mock.calls[0]![1]).toMatchObject({ keepalive: true });
  });

  it('si el navegador lo rechaza (más de 64 KB), se manda igual sin keepalive', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('body too large'))
      .mockResolvedValueOnce(new Response('ok'));
    vi.stubGlobal('fetch', f);
    pedirKeepalive();
    const r = await fetchConKeepalive('https://x/rest', { method: 'POST', body: '{}' });
    expect(await r.text()).toBe('ok');
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[1]![1]).not.toHaveProperty('keepalive');
  });

  it('pasada la ventana, como siempre', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const f = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', f);
    pedirKeepalive();
    vi.setSystemTime(10_000 + VENTANA_KEEPALIVE_MS + 1);
    await fetchConKeepalive('https://x/rest', { method: 'POST' });
    expect(f.mock.calls[0]![1]).not.toHaveProperty('keepalive');
  });
});
