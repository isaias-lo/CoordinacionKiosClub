import { describe, it, expect } from 'vitest';
import { veredictoMantencion } from '../colaMantencion';

describe('veredictoMantencion', () => {
  it('la sesión vencida se reintenta: no es un rechazo de la solicitud', () => {
    expect(veredictoMantencion(401)).toBe('reintentar');
  });

  it('un rechazo de validación es definitivo', () => {
    expect(veredictoMantencion(400)).toBe('bloqueado');
    expect(veredictoMantencion(403)).toBe('bloqueado');
  });

  it('lo demás sigue la regla general de la cola', () => {
    expect(veredictoMantencion(200)).toBe('ok');
    expect(veredictoMantencion(500)).toBe('reintentar');
    expect(veredictoMantencion(502)).toBe('reintentar');
    expect(veredictoMantencion(429)).toBe('reintentar');
  });
});
