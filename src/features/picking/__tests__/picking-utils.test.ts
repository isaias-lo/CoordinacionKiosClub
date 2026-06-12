import { describe, it, expect } from 'vitest';
import {
  stampFromISO,
  buildCanonicalId,
  sanitizeForBarcode,
  categoriesToContenido,
  fmtDuration,
  fmtSecs,
  cphColor,
  isAllowedPicker,
  relativeTime,
  isAbastecimientoOp,
  parseOrigin,
  getStoreName,
  getStoreGroup,
} from '../picking-utils';

// ─── stampFromISO ─────────────────────────────────────────────────────────────

describe('stampFromISO', () => {
  it('converts YYYY-MM-DD to DDMMYYYYformat', () => {
    expect(stampFromISO('2025-06-12')).toBe('12062025');
  });

  it('preserves leading zeros in day and month', () => {
    expect(stampFromISO('2024-01-05')).toBe('05012024');
  });
});

// ─── buildCanonicalId ─────────────────────────────────────────────────────────

describe('buildCanonicalId', () => {
  const date = '2025-06-12'; // stamp = "12062025"

  it('builds Pallet id: P{seq}{cod}{stamp}P', () => {
    expect(buildCanonicalId('P', 3, 'LAS', date)).toBe('P3LAS12062025P');
  });

  it('builds Bulto id: {seq}B{cod}{stamp}B', () => {
    expect(buildCanonicalId('B', 1, 'VIT', date)).toBe('1BVIT12062025B');
  });

  it('builds Chocolates id: CH{seq}{cod}{stamp}CH', () => {
    expect(buildCanonicalId('CH', 2, 'MAI', date)).toBe('CH2MAI12062025CH');
  });

  it('builds Contenedor id: C{seq}{cod}{stamp}C', () => {
    expect(buildCanonicalId('C', 5, 'PRO', date)).toBe('C5PRO12062025C');
  });

  it('uses fallback for unknown tipo', () => {
    expect(buildCanonicalId('otro', 1, 'TST', date)).toBe('1TST12062025');
  });
});

// ─── sanitizeForBarcode ───────────────────────────────────────────────────────

describe('sanitizeForBarcode', () => {
  it('strips accent marks', () => {
    expect(sanitizeForBarcode('Área de café')).toBe('Area de cafe');
  });

  it('removes non-printable-ASCII characters', () => {
    expect(sanitizeForBarcode('Hello\x00World')).toBe('HelloWorld');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeForBarcode('  hello  ')).toBe('hello');
  });

  it('leaves plain ASCII unchanged', () => {
    expect(sanitizeForBarcode('Picker 5')).toBe('Picker 5');
  });
});

// ─── categoriesToContenido ────────────────────────────────────────────────────

describe('categoriesToContenido', () => {
  it('returns "chocolate" when chocolates present (priority)', () => {
    expect(categoriesToContenido(['Chocolates', 'Comida'])).toBe('chocolate');
  });

  it('returns "completo" when comida + aseo + hogar', () => {
    expect(categoriesToContenido(['Comida', 'Aseo', 'Hogar'])).toBe('completo');
  });

  it('returns "comida-aseo" when comida + aseo', () => {
    expect(categoriesToContenido(['Comida', 'Limpieza'])).toBe('comida-aseo');
  });

  it('returns "aseo-hogar" when aseo + hogar', () => {
    expect(categoriesToContenido(['Aseo', 'Hogar'])).toBe('aseo-hogar');
  });

  it('returns "mixto" when comida + hogar', () => {
    expect(categoriesToContenido(['Comida', 'Hogar'])).toBe('mixto');
  });

  it('returns "comida" for comida alone', () => {
    expect(categoriesToContenido(['Alimentos frescos'])).toBe('comida');
  });

  it('returns "aseo" for aseo alone', () => {
    expect(categoriesToContenido(['Aseo personal'])).toBe('aseo');
  });

  it('returns "hogar" as fallback', () => {
    expect(categoriesToContenido(['Hogar'])).toBe('hogar');
  });

  it('returns "hogar" for empty array', () => {
    expect(categoriesToContenido([])).toBe('hogar');
  });
});

// ─── fmtDuration ─────────────────────────────────────────────────────────────

describe('fmtDuration', () => {
  it('returns "—" for zero minutes', () => {
    expect(fmtDuration(0)).toBe('—');
  });

  it('returns "—" for negative', () => {
    expect(fmtDuration(-5)).toBe('—');
  });

  it('formats minutes only when < 60', () => {
    expect(fmtDuration(45)).toBe('45m');
  });

  it('formats hours and minutes', () => {
    expect(fmtDuration(90)).toBe('1h 30m');
  });

  it('formats exact hours with 0 minutes', () => {
    expect(fmtDuration(120)).toBe('2h 0m');
  });
});

// ─── fmtSecs ─────────────────────────────────────────────────────────────────

describe('fmtSecs', () => {
  it('returns "—" for zero', () => {
    expect(fmtSecs(0)).toBe('—');
  });

  it('returns seconds only when < 60', () => {
    expect(fmtSecs(45)).toBe('45s');
  });

  it('formats minutes and seconds', () => {
    expect(fmtSecs(90)).toBe('1m 30s');
  });

  it('omits seconds when exactly a whole minute', () => {
    expect(fmtSecs(120)).toBe('2m');
  });
});

// ─── cphColor ─────────────────────────────────────────────────────────────────

describe('cphColor', () => {
  it('returns grey for 0 (no activity)', () => {
    expect(cphColor(0)).toBe('#9CA3AF');
  });

  it('returns red for low performance (< 60)', () => {
    expect(cphColor(30)).toBe('#DC2626');
  });

  it('returns orange for mid performance (60–89)', () => {
    expect(cphColor(75)).toBe('#D97706');
  });

  it('returns green for high performance (>= 90)', () => {
    expect(cphColor(100)).toBe('#16A34A');
  });

  it('returns green at exactly 90', () => {
    expect(cphColor(90)).toBe('#16A34A');
  });

  it('returns orange at exactly 60', () => {
    expect(cphColor(60)).toBe('#D97706');
  });
});

// ─── isAllowedPicker ──────────────────────────────────────────────────────────

describe('isAllowedPicker', () => {
  it('allows Picker 1 through 18', () => {
    expect(isAllowedPicker('Picker 1')).toBe(true);
    expect(isAllowedPicker('Picker 18')).toBe(true);
    expect(isAllowedPicker('Pickers 5')).toBe(true);
  });

  it('rejects Picker 0 and Picker 19', () => {
    expect(isAllowedPicker('Picker 0')).toBe(false);
    expect(isAllowedPicker('Picker 19')).toBe(false);
  });

  it('allows Adquisiciones (with or without accent)', () => {
    expect(isAllowedPicker('Adquisiciones')).toBe(true);
    expect(isAllowedPicker('Adquisición')).toBe(true);
  });

  it('allows Calidad', () => {
    expect(isAllowedPicker('Calidad')).toBe(true);
  });

  it('rejects arbitrary names', () => {
    expect(isAllowedPicker('Juan Perez')).toBe(false);
    expect(isAllowedPicker('Bodega')).toBe(false);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(isAllowedPicker('  PICKER 3  ')).toBe(true);
    expect(isAllowedPicker('CALIDAD')).toBe(true);
  });
});

// ─── relativeTime ─────────────────────────────────────────────────────────────

describe('relativeTime', () => {
  const now = new Date('2025-06-12T10:00:00Z').getTime();

  it('returns "ahora mismo" when < 1 min ago', () => {
    const ts = new Date(now - 30_000).toISOString();
    expect(relativeTime(ts, now)).toBe('ahora mismo');
  });

  it('returns "hace N min" when < 60 min ago', () => {
    const ts = new Date(now - 5 * 60_000).toISOString();
    expect(relativeTime(ts, now)).toBe('hace 5 min');
  });

  it('returns "hace N h" when >= 60 min ago', () => {
    const ts = new Date(now - 2.5 * 60 * 60_000).toISOString();
    expect(relativeTime(ts, now)).toBe('hace 2 h');
  });

  it('returns "hace 1 min" exactly at 1 minute', () => {
    const ts = new Date(now - 60_000).toISOString();
    expect(relativeTime(ts, now)).toBe('hace 1 min');
  });
});

// ─── isAbastecimientoOp ───────────────────────────────────────────────────────

describe('isAbastecimientoOp', () => {
  it('returns true for Abastecimiento Comida', () => {
    expect(isAbastecimientoOp('Abastecimiento Comida 29CFL Fecha(12/06/2025)')).toBe(true);
  });

  it('returns true for Abastecimiento Aseo', () => {
    expect(isAbastecimientoOp('Abastecimiento Aseo 01VIT')).toBe(true);
  });

  it('returns true for Abastecimiento Chocolates', () => {
    expect(isAbastecimientoOp('Abastecimiento Chocolates LAS')).toBe(true);
  });

  it('returns false for unrelated origins', () => {
    expect(isAbastecimientoOp('Recepcion tienda LAS')).toBe(false);
  });
});

// ─── parseOrigin ─────────────────────────────────────────────────────────────

describe('parseOrigin', () => {
  it('extracts categories from Abastecimiento keywords', () => {
    const { categories } = parseOrigin('Abastecimiento Comida 29CFL Fecha(12/06/2025)');
    expect(categories).toContain('Comida');
  });

  it('extracts multiple categories', () => {
    const { categories } = parseOrigin('Abastecimiento Comida, Abastecimiento Aseo 01VIT');
    expect(categories).toContain('Comida');
    expect(categories).toContain('Aseo');
  });

  it('extracts store code from digit+letter pattern', () => {
    const { storeCode } = parseOrigin('Abastecimiento Comida 29CFL Fecha(12/06/2025)');
    expect(storeCode).toBe('29CFL');
  });

  it('extracts date from Fecha(DD/MM/YYYY) format', () => {
    const { originDate } = parseOrigin('Abastecimiento Comida 29CFL Fecha(12/06/2025)');
    expect(originDate).toBe('12/06/2025');
  });

  it('returns empty strings when nothing matches', () => {
    const { storeCode, originDate, categories } = parseOrigin('Operacion sin datos');
    expect(storeCode).toBe('');
    expect(originDate).toBe('');
    expect(categories).toHaveLength(0);
  });

  it('falls back to parenthetical categories', () => {
    const { categories } = parseOrigin('Transferencia (Frutas, Verduras)');
    expect(categories).toContain('Frutas');
    expect(categories).toContain('Verduras');
  });
});

// ─── getStoreName ─────────────────────────────────────────────────────────────

describe('getStoreName', () => {
  it('returns the code itself for unknown stores', () => {
    expect(getStoreName('UNKNOWN')).toBe('UNKNOWN');
  });
});

// ─── getStoreGroup ────────────────────────────────────────────────────────────

describe('getStoreGroup', () => {
  it('returns "santiago" for unknown store code (default)', () => {
    const result = getStoreGroup({ cod: 'UNKNOWN', name: 'X', sources: [] });
    expect(result).toBe('santiago');
  });

  it('returns "region" when sources includes "regiones"', () => {
    const result = getStoreGroup({ cod: 'UNKNOWN', name: 'X', sources: ['regiones'] });
    expect(result).toBe('region');
  });
});
