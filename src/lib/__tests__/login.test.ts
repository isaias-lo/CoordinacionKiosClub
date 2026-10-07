import { describe, it, expect } from 'vitest';
import { destinoTrasLogin, mensajeDeErrorLogin, siguienteSegura } from '../login';

describe('mensajeDeErrorLogin', () => {
  it('el límite de Supabase no se muestra en inglés', () => {
    const m = mensajeDeErrorLogin({ message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' });
    expect(m).toMatch(/Demasiados intentos/);
  });

  it('sin señal explica la conexión, no "Failed to fetch"', () => {
    expect(mensajeDeErrorLogin({ message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' }))
      .toMatch(/Sin conexión/);
    expect(mensajeDeErrorLogin({ message: 'cualquier cosa' }, false)).toMatch(/Sin conexión/);
  });

  it('credenciales malas', () => {
    expect(mensajeDeErrorLogin({ message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }))
      .toBe('Correo o contraseña incorrectos.');
  });

  it('un 5xx y un error desconocido no muestran el texto crudo', () => {
    expect(mensajeDeErrorLogin({ message: 'Internal error', status: 500 })).toMatch(/servidor no respondió/);
    expect(mensajeDeErrorLogin({ message: 'Something odd', status: 400, code: 'weird' })).not.toMatch(/Something/);
  });
});

describe('siguienteSegura', () => {
  it('solo rutas internas', () => {
    expect(siguienteSegura('/despacho/santiago?x=1')).toBe('/despacho/santiago?x=1');
    expect(siguienteSegura('//malo.com')).toBeNull();
    expect(siguienteSegura('/\\malo.com')).toBeNull();
    expect(siguienteSegura('https://malo.com')).toBeNull();
    expect(siguienteSegura('/login?next=/x')).toBeNull();
    expect(siguienteSegura(null)).toBeNull();
  });
});

describe('destinoTrasLogin', () => {
  const asistente = {
    role: 'asistente-despacho',
    home_path: '/despacho-hub',
    allowed_paths: ['/despacho-hub', '/despacho/regiones', '/despacho/santiago', '/despacho/conteo', '/perfil'],
  };

  it('vuelve a la pantalla pedida si el rol puede abrirla', () => {
    expect(destinoTrasLogin(asistente, '/despacho/santiago')).toBe('/despacho/santiago');
  });

  it('si no puede, va a su inicio', () => {
    expect(destinoTrasLogin(asistente, '/admin')).toBe('/despacho-hub');
    expect(destinoTrasLogin(asistente, null)).toBe('/despacho-hub');
  });
});
