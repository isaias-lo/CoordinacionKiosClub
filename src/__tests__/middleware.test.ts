import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Simula un `getSession()` que REFRESCÓ el token: escribe la cookie nueva vía `setAll` y devuelve
// la sesión, como hace @supabase/ssr cuando al token le quedan menos de 90 s.
let usuario: Record<string, unknown> | null = null;
let escribe: { name: string; value: string }[] = [];

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_u: string, _k: string, { cookies }: { cookies: { setAll: (c: unknown[]) => void } }) => ({
    auth: {
      getSession: async () => {
        if (escribe.length) cookies.setAll(escribe.map(c => ({ ...c, options: { path: '/', maxAge: 100 } })));
        return { data: { session: usuario ? { user: usuario } : null } };
      },
    },
  }),
}));

const { middleware } = await import('../middleware');

const pedir = (path: string) => middleware(new NextRequest(`https://app.test${path}`));

beforeEach(() => { usuario = null; escribe = []; });

describe('middleware — redirecciones', () => {
  it('al redirigir conserva la cookie que Supabase acaba de refrescar', async () => {
    usuario = { user_metadata: { role: 'asistente-despacho' } };
    escribe = [{ name: 'sb-x-auth-token', value: 'nuevo' }];
    const r = await pedir('/');  // la app instalada arranca en `/`
    expect(r.headers.get('location')).toBe('https://app.test/despacho');
    expect(r.cookies.get('sb-x-auth-token')?.value).toBe('nuevo');
  });

  it('al mandar a /login conserva el borrado de una sesión que no se pudo refrescar', async () => {
    escribe = [{ name: 'sb-x-auth-token', value: '' }];
    const r = await pedir('/despacho');
    expect(r.headers.get('location')).toBe('https://app.test/login?next=%2Fdespacho');
    expect(r.cookies.get('sb-x-auth-token')?.value).toBe('');
  });

  it('un token sin rutas no entra en bucle: Perfil se abre', async () => {
    usuario = { user_metadata: { role: 'asistente-despacho', allowed_paths: [] } };
    const r1 = await pedir('/despacho');
    expect(r1.headers.get('location')).toBe('https://app.test/perfil');
    const r2 = await pedir('/perfil');
    expect(r2.headers.get('location')).toBeNull();
  });

  it('con una sesión abierta, /login se abre en vez de rebotar al inicio de esa cuenta', async () => {
    usuario = { user_metadata: { role: 'admin' } };
    const r = await pedir('/login');
    expect(r.headers.get('location')).toBeNull();
  });

  it('las otras páginas públicas siguen mandando al inicio a quien ya entró', async () => {
    usuario = { user_metadata: { role: 'asistente-despacho' } };
    const r = await pedir('/registro');
    expect(r.headers.get('location')).toBe('https://app.test/despacho');
  });

  it('sin sesión recuerda la pantalla pedida, salvo el inicio', async () => {
    const r1 = await pedir('/despacho/santiago?dia=2026-10-07');
    expect(r1.headers.get('location')).toBe('https://app.test/login?next=%2Fdespacho%2Fsantiago%3Fdia%3D2026-10-07');
    const r2 = await pedir('/');
    expect(r2.headers.get('location')).toBe('https://app.test/login');
  });
});
