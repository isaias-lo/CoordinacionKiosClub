import { describe, it, expect } from 'vitest';
import { parseActivo, serializeActivo } from '../activo';

describe('parseActivo', () => {
  it('inactivo solo para NO / FALSE / 0 (case-insensitive, con espacios)', () => {
    expect(parseActivo('NO')).toBe(false);
    expect(parseActivo(' no ')).toBe(false);
    expect(parseActivo('FALSE')).toBe(false);
    expect(parseActivo('false')).toBe(false);
    expect(parseActivo('0')).toBe(false);
  });

  it('activo para SI / TRUE / vacío / ausente (default activo)', () => {
    expect(parseActivo('SI')).toBe(true);
    expect(parseActivo('TRUE')).toBe(true);
    expect(parseActivo('')).toBe(true);
    expect(parseActivo(undefined)).toBe(true);
    expect(parseActivo(null)).toBe(true);
  });
});

describe('serializeActivo', () => {
  it('true → SI, false → NO', () => {
    expect(serializeActivo(true)).toBe('SI');
    expect(serializeActivo(false)).toBe('NO');
  });
});

describe('round-trip (idempotencia — el bug original)', () => {
  it('serializar y volver a parsear conserva el estado', () => {
    expect(parseActivo(serializeActivo(false))).toBe(false); // NO se reactiva
    expect(parseActivo(serializeActivo(true))).toBe(true);
  });

  it('tolera el formato viejo TRUE/FALSE (compatibilidad hacia atrás)', () => {
    // Antes se exportaba 'FALSE'; debe seguir leyéndose como inactivo.
    expect(parseActivo('FALSE')).toBe(false);
    expect(parseActivo('TRUE')).toBe(true);
  });
});
