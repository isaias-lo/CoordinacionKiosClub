import { describe, it, expect } from 'vitest';
import { normalizeCod, COD_RE } from '../normalizeCod';

describe('normalizeCod (sync Sheets → Supabase)', () => {
  it('CONSERVA la Ñ (no la convierte en N) — evita duplicar 23PEÑ/37VIÑ', () => {
    expect(normalizeCod('23PEÑ')).toBe('23PEÑ');
    expect(normalizeCod('37VIÑ')).toBe('37VIÑ');
  });

  it('pone en mayúsculas y recorta espacios', () => {
    expect(normalizeCod('  37viñ ')).toBe('37VIÑ');
    expect(normalizeCod('33con')).toBe('33CON');
  });

  it('quita acentos de vocales (no aparecen en códigos, pero es defensivo)', () => {
    expect(normalizeCod('12ÁÉÍ')).toBe('12AEI');
  });

  it('el código con Ñ pasa el COD_RE', () => {
    expect(COD_RE.test(normalizeCod('23PEÑ'))).toBe(true);
    expect(COD_RE.test(normalizeCod('37VIÑ'))).toBe(true);
  });

  it('la variante SIN Ñ es un código distinto (por eso duplicaba)', () => {
    expect(normalizeCod('23PEN')).toBe('23PEN');
    expect(normalizeCod('23PEÑ')).not.toBe(normalizeCod('23PEN'));
  });
});
