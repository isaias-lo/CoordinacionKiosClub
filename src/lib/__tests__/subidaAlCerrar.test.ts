import { describe, it, expect } from 'vitest';
import { armarSubidaAlCerrar, marcaDeRespuesta, TOPE_KEEPALIVE_BYTES } from '../subidaAlCerrar';

const base = {
  baseUrl: 'https://xyz.supabase.co/', apiKey: 'anon', token: 'tok',
  fuente: 'santiago', fecha: '2026-10-29', state: { items: { '18FLO': [] } }, userId: 'u1',
  ahora: new Date('2026-10-29T13:00:00Z'),
};

describe('la subida al cerrar la app', () => {
  it('sale con keepalive, el token y el mismo upsert que supabase-js', () => {
    const p = armarSubidaAlCerrar(base)!;
    expect(p.url).toBe('https://xyz.supabase.co/rest/v1/shared_session_state?on_conflict=fecha,fuente&select=updated_at');
    expect(p.init.keepalive).toBe(true);
    expect(p.init.method).toBe('POST');
    const h = p.init.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer tok');
    expect(h.apikey).toBe('anon');
    expect(h.Prefer).toContain('resolution=merge-duplicates');
    expect(JSON.parse(p.init.body as string)).toEqual({
      fecha: '2026-10-29', fuente: 'santiago', state: { items: { '18FLO': [] } },
      updated_at: '2026-10-29T13:00:00.000Z', updated_by: 'u1',
    });
  });

  it('sin sesión todavía no se arma: se sube por el camino de siempre', () => {
    expect(armarSubidaAlCerrar({ ...base, token: null })).toBeNull();
  });

  it('un estado más grande que el tope de keepalive no se arma', () => {
    const grande = { items: 'x'.repeat(TOPE_KEEPALIVE_BYTES) };
    expect(armarSubidaAlCerrar({ ...base, state: grande })).toBeNull();
  });

  it('el tope cuenta bytes, no letras: los acentos pesan dos', () => {
    const casi = Math.floor(TOPE_KEEPALIVE_BYTES / 2) - 50;
    expect(armarSubidaAlCerrar({ ...base, state: 'a'.repeat(casi * 2 - 200) })).not.toBeNull();
    expect(armarSubidaAlCerrar({ ...base, state: 'á'.repeat(casi + 100) })).toBeNull();
  });

  it('lee el updated_at de la respuesta', () => {
    expect(marcaDeRespuesta([{ updated_at: '2026-10-29T13:00:00Z' }])).toBe(Date.parse('2026-10-29T13:00:00Z'));
    expect(marcaDeRespuesta([])).toBeNull();
    expect(marcaDeRespuesta(null)).toBeNull();
    expect(marcaDeRespuesta([{ updated_at: 'no es fecha' }])).toBeNull();
  });
});
