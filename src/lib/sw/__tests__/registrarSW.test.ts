import { describe, it, expect } from 'vitest';
import { queHacerConElSW, haySWEsperando } from '../registrarSW';

describe('queHacerConElSW', () => {
  it('registra cuando el navegador lo soporta y no está deshabilitado', () => {
    expect(queHacerConElSW({ soportado: true, deshabilitado: false })).toBe('registrar');
  });

  it('desinstala cuando está deshabilitado — es la salida de emergencia', () => {
    // Un service worker mal publicado no se arregla publicando otro: se queda pegado en cada
    // dispositivo. Esta es la única forma de sacarlo sin ir tablet por tablet.
    expect(queHacerConElSW({ soportado: true, deshabilitado: true })).toBe('desinstalar');
  });

  it('no hace nada donde el navegador no lo soporta', () => {
    expect(queHacerConElSW({ soportado: false, deshabilitado: false })).toBe('nada');
  });

  it('no intenta desinstalar donde nunca pudo registrar', () => {
    expect(queHacerConElSW({ soportado: false, deshabilitado: true })).toBe('nada');
  });
});

describe('haySWEsperando', () => {
  it('detecta la versión ya descargada esperando su turno', () => {
    expect(haySWEsperando({ waiting: {} })).toBe(true);
  });

  it('no avisa cuando no hay ninguna esperando', () => {
    expect(haySWEsperando({ waiting: null })).toBe(false);
  });

  it('no avisa sin registro — la app recién abrió o el registro falló', () => {
    expect(haySWEsperando(null)).toBe(false);
    expect(haySWEsperando(undefined)).toBe(false);
  });
});

describe('el matcher del middleware deja pasar lo que el navegador pide sin sesión', () => {
  // Copiado tal cual de src/middleware.ts. Si allá cambia y acá no, este test avisa: el síntoma en
  // producción es que la app simplemente deja de ofrecerse para instalar, sin ningún error.
  const MATCHER = /^\/((?!_next\/static|_next\/image|favicon.ico|sw\.js|api\/|.*\.(?:b64|mjs|ico|png|jpg|jpeg|svg|gif|webp|webmanifest|woff2?|ttf)).*)$/;

  const pasaPorElMiddleware = (ruta: string) => MATCHER.test(ruta);

  it('no intercepta lo que se pide antes de que exista sesión', () => {
    expect(pasaPorElMiddleware('/sw.js')).toBe(false);
    expect(pasaPorElMiddleware('/manifest.webmanifest')).toBe(false);
    expect(pasaPorElMiddleware('/icon-192.png')).toBe(false);
    expect(pasaPorElMiddleware('/apple-touch-icon.png')).toBe(false);
  });

  it('sigue controlando las pantallas de la app', () => {
    expect(pasaPorElMiddleware('/login')).toBe(true);
    expect(pasaPorElMiddleware('/picking')).toBe(true);
    expect(pasaPorElMiddleware('/offline')).toBe(true);  // pasa, y el middleware lo deja seguir
  });
});
