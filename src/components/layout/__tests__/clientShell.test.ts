import { describe, it, expect } from 'vitest';
import { isAuthPath } from '../authPaths';

describe('isAuthPath — qué rutas van SIN sidebar (auth/públicas)', () => {
  it('caso del bug: /registros NO es auth (debe llevar sidebar)', () => {
    expect(isAuthPath('/registros')).toBe(false);
  });

  it('la página de registro de usuario SÍ es auth (sin sidebar)', () => {
    expect(isAuthPath('/registro')).toBe(true);
    expect(isAuthPath('/registro/confirmar')).toBe(true);
  });

  it('rutas de auth conocidas siguen siendo auth', () => {
    expect(isAuthPath('/login')).toBe(true);
    expect(isAuthPath('/recuperar-contrasena')).toBe(true);
    expect(isAuthPath('/actualizar-contrasena')).toBe(true);
    expect(isAuthPath('/espera')).toBe(true);
  });

  it('el QR público /r/<token> sigue siendo auth (sin sidebar)', () => {
    expect(isAuthPath('/r/abc123')).toBe(true);
    expect(isAuthPath('/r/')).toBe(true);
  });

  it('la recepción pública por QR /recepcion va SIN sidebar', () => {
    expect(isAuthPath('/recepcion')).toBe(true);
    expect(isAuthPath('/recepcion?cod=29CFL&p=1&b=1')).toBe(false); // el query no es parte del pathname
  });

  it('/recepcion es límite de segmento (otras rutas /recepcion* llevan sidebar)', () => {
    expect(isAuthPath('/recepcion-otra')).toBe(false);
  });

  it('rutas normales de la app NO son auth (llevan sidebar)', () => {
    expect(isAuthPath('/despacho/santiago')).toBe(false);
    expect(isAuthPath('/despacho/regiones')).toBe(false);
    expect(isAuthPath('/picking')).toBe(false);
    expect(isAuthPath('/')).toBe(false);
  });

  it('no rompe con vacío', () => {
    expect(isAuthPath('')).toBe(false);
  });
});
