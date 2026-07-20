import { describe, it, expect } from 'vitest';
import { guideKey } from '../guideKey';

// NFC vs NFD generados en runtime → deterministas, sin depender de los bytes del archivo.
const NFC = '37VIÑ'.normalize('NFC'); // Ñ precompuesta (U+00D1)
const NFD = '37VIÑ'.normalize('NFD'); // N + tilde combinante (U+0303)

describe('guideKey — clave canónica de guías (robusta a la Ñ)', () => {
  it('unifica NFC y NFD de 37VIÑ', () => {
    expect(NFC).not.toBe(NFD);                 // distintos byte a byte…
    expect(guideKey(NFC)).toBe(guideKey(NFD)); // …pero la clave canónica coincide
    expect(guideKey(NFC)).toBe('37VIN');
  });

  it('unifica 37VIÑ (con tilde) y 37VIN (sin tilde)', () => {
    expect(guideKey(NFC)).toBe(guideKey('37VIN'));
    expect(guideKey(NFC)).toBe('37VIN');
  });

  it('unifica 23PEÑ (Peñalolén) y 23PEN', () => {
    expect(guideKey('23PEÑ')).toBe('23PEN');
    expect(guideKey('23PEN')).toBe('23PEN');
  });

  it('es idempotente para códigos sin Ñ', () => {
    expect(guideKey('33CON')).toBe('33CON');
    expect(guideKey('08RNC')).toBe('08RNC');
    expect(guideKey('54MPQ')).toBe('54MPQ');
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(guideKey(' 37viñ ')).toBe('37VIN');
  });
});
