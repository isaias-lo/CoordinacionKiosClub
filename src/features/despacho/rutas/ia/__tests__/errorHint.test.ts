import { describe, it, expect } from 'vitest';
import { esErrorDeConfig } from '../errorHint';

describe('esErrorDeConfig', () => {
  it('detecta la API key ausente en el servidor', () => {
    expect(esErrorDeConfig('ANTHROPIC_API_KEY no configurada en el servidor')).toBe(true);
    expect(esErrorDeConfig('falta la API key')).toBe(true);
    expect(esErrorDeConfig('API_KEY no configurado')).toBe(true);
  });

  it('un fallo del modelo / transitorio NO es de configuración', () => {
    expect(esErrorDeConfig('Asistente IA no disponible: 404 model not found')).toBe(false);
    expect(esErrorDeConfig('Asistente IA no disponible: request timed out')).toBe(false);
    expect(esErrorDeConfig('error 502')).toBe(false);
  });

  it('tolera vacío / null / undefined', () => {
    expect(esErrorDeConfig('')).toBe(false);
    expect(esErrorDeConfig(null)).toBe(false);
    expect(esErrorDeConfig(undefined)).toBe(false);
  });
});
