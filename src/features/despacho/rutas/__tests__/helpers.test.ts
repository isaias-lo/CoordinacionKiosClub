import { describe, it, expect } from 'vitest';
import { dkm, getDia, norm, formatCod, fechaTxt, todayStr } from '../utils/helpers';

// ─── dkm (Haversine distance) ─────────────────────────────────────────────────

describe('dkm', () => {
  it('returns 0 for the same point', () => {
    expect(dkm([-33.4, -70.6], [-33.4, -70.6])).toBe(0);
  });

  it('returns a positive distance for two different points', () => {
    const dist = dkm([-33.412581, -70.632438], [-33.371694, -70.513811]);
    expect(dist).toBeGreaterThan(0);
  });

  it('is symmetric (A→B == B→A)', () => {
    const a: [number, number] = [-33.412581, -70.632438]; // CD Santiago
    const b: [number, number] = [-33.371694, -70.513811]; // Las Condes
    expect(dkm(a, b)).toBeCloseTo(dkm(b, a), 6);
  });

  it('correctly estimates ~11-13 km between CD and Las Condes', () => {
    const cd: [number, number]  = [-33.412581, -70.632438];
    const las: [number, number] = [-33.371694, -70.513811];
    const d = dkm(cd, las);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(15);
  });

  it('correctly estimates ~80-110 km between CD and Viña del Mar', () => {
    const cd:  [number, number] = [-33.412581, -70.632438];
    const vin: [number, number] = [-33.015089, -71.550552];
    const d = dkm(cd, vin);
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(110);
  });

  it('closer point has smaller distance', () => {
    const cd:    [number, number] = [-33.412581, -70.632438];
    const close: [number, number] = [-33.420, -70.640];
    const far:   [number, number] = [-33.500, -70.700];
    expect(dkm(cd, close)).toBeLessThan(dkm(cd, far));
  });
});

// ─── getDia ───────────────────────────────────────────────────────────────────

describe('getDia', () => {
  // Reference: June 2025 — June 2 = Monday
  it('returns LU for Monday', () => {
    expect(getDia('2025-06-09')).toBe('LU'); // June 9 = Monday
  });

  it('returns MA for Tuesday', () => {
    expect(getDia('2025-06-10')).toBe('MA');
  });

  it('returns MI for Wednesday', () => {
    expect(getDia('2025-06-11')).toBe('MI');
  });

  it('returns JU for Thursday', () => {
    expect(getDia('2025-06-12')).toBe('JU');
  });

  it('returns VI for Friday', () => {
    expect(getDia('2025-06-13')).toBe('VI');
  });

  it('returns SA for Saturday', () => {
    expect(getDia('2025-06-14')).toBe('SA');
  });

  it('returns LU for Sunday (maps to Monday in delivery schedule)', () => {
    expect(getDia('2025-06-08')).toBe('LU'); // June 8 = Sunday
  });
});

// ─── norm ─────────────────────────────────────────────────────────────────────

describe('norm', () => {
  it('uppercases input', () => {
    expect(norm('las')).toBe('12LAS');
  });

  it('trims whitespace before processing', () => {
    expect(norm('  LAS  ')).toBe('12LAS');
  });

  it('resolves short alias codes to full codes', () => {
    expect(norm('LAS')).toBe('12LAS');
    expect(norm('VIT')).toBe('03VIT');
    expect(norm('VIN')).toBe('37VIN');
    expect(norm('CFL')).toBe('29CFL');
  });

  it('resolves codes with Ñ accent via ALIAS', () => {
    // PEÑ is a key in ALIAS pointing to 23PEÑ
    expect(norm('PEÑ')).toBe('23PEÑ');
    expect(norm('PEN')).toBe('23PEÑ'); // PEN → 23PEÑ in ALIAS
  });

  it('passes through full canonical codes unchanged', () => {
    expect(norm('12LAS')).toBe('12LAS');
    expect(norm('03VIT')).toBe('03VIT');
  });

  it('strips accent marks when no alias matches', () => {
    // A code not in ALIAS with accented chars → stripped version returned
    expect(norm('CAFÉ')).toBe('CAFE');
    expect(norm('ÚNICO')).toBe('UNICO');
  });

  it('replaces Ñ with N when not in ALIAS', () => {
    expect(norm('SEÑAL')).toBe('SENAL');
  });
});

// ─── formatCod ────────────────────────────────────────────────────────────────

describe('formatCod', () => {
  it('inserts space between leading digits and letters', () => {
    expect(formatCod('29CFL')).toBe('29 CFL');
    expect(formatCod('05LP')).toBe('05 LP');
    expect(formatCod('12LAS')).toBe('12 LAS');
  });

  it('leaves pure-letter codes unchanged', () => {
    expect(formatCod('LAS')).toBe('LAS');
    expect(formatCod('VIT')).toBe('VIT');
  });

  it('handles single-digit prefixes', () => {
    expect(formatCod('1LP')).toBe('1 LP');
  });
});

// ─── fechaTxt ─────────────────────────────────────────────────────────────────

describe('fechaTxt', () => {
  it('returns empty string for empty input', () => {
    expect(fechaTxt('')).toBe('');
  });

  it('returns a non-empty string for a valid date', () => {
    const result = fechaTxt('2025-06-12');
    expect(result.length).toBeGreaterThan(0);
  });

  it('output includes the numeric day', () => {
    // "jueves, 12 de junio" — day 12 must appear
    expect(fechaTxt('2025-06-12')).toContain('12');
  });

  it('output does not include the year (weekday + day + month only)', () => {
    // fechaTxt omits year; fechaLargaTxt includes year
    expect(fechaTxt('2025-06-12')).not.toContain('2025');
  });
});

// ─── todayStr ─────────────────────────────────────────────────────────────────

describe('todayStr', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns the current year', () => {
    const year = new Date().getFullYear().toString();
    expect(todayStr()).toContain(year);
  });
});
