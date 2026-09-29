import { describe, it, expect } from 'vitest';
import { mensajeDeCamara } from '../camara';

function err(name: string): DOMException {
  return new DOMException('mensaje crudo del navegador', name);
}

describe('mensajeDeCamara', () => {
  it('el permiso denegado en la app instalada explica por qué se pide de nuevo', () => {
    // Es el caso que importa: al abrir desde el ícono el permiso no se hereda del navegador, y
    // quien no lo sabe concluye que el escáner se rompió al instalar la app.
    const m = mensajeDeCamara(err('NotAllowedError'), true);
    expect(m.titulo).toContain('permiso');
    expect(m.comoArreglarlo).toContain('de nuevo');
  });

  it('el permiso denegado en el navegador manda al candado de la barra', () => {
    const m = mensajeDeCamara(err('NotAllowedError'), false);
    expect(m.comoArreglarlo).toContain('candado');
  });

  it('SecurityError se trata igual que un permiso denegado', () => {
    expect(mensajeDeCamara(err('SecurityError'), true).titulo)
      .toBe(mensajeDeCamara(err('NotAllowedError'), true).titulo);
  });

  it('sin cámara ofrece el ingreso manual', () => {
    expect(mensajeDeCamara(err('NotFoundError')).comoArreglarlo).toContain('manual');
    expect(mensajeDeCamara(err('OverconstrainedError')).titulo).toContain('No se encontró');
  });

  it('cámara ocupada dice que se cierre la otra app', () => {
    expect(mensajeDeCamara(err('NotReadableError')).titulo).toContain('ocupada');
    expect(mensajeDeCamara(err('AbortError')).titulo).toContain('ocupada');
  });

  it('un error desconocido no inventa una solución', () => {
    // Decirle a alguien que haga algo que no va a servir es peor que no decir nada.
    const m = mensajeDeCamara(err('LoQueSea'));
    expect(m.titulo).toBe('No se pudo abrir la cámara');
    expect(m.comoArreglarlo).toBe('');
  });

  it('aguanta cualquier cosa que no sea un error', () => {
    expect(mensajeDeCamara(undefined).titulo).toBe('No se pudo abrir la cámara');
    expect(mensajeDeCamara('texto suelto').titulo).toBe('No se pudo abrir la cámara');
    expect(mensajeDeCamara(null).titulo).toBe('No se pudo abrir la cámara');
  });
});
