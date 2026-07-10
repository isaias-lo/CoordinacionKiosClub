import { describe, it, expect } from 'vitest';
import { dkm, getDia, norm, formatCod, fechaTxt, todayStr, poolPendiente } from '../utils/helpers';

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
    expect(norm('VIN')).toBe('37VIÑ');
    expect(norm('CFL')).toBe('29CFL');
  });

  it('resolves codes with Ñ accent via ALIAS', () => {
    // PEÑ is a key in ALIAS pointing to 23PEÑ
    expect(norm('PEÑ')).toBe('23PEÑ');
    expect(norm('PEN')).toBe('23PEÑ'); // PEN → 23PEÑ in ALIAS
  });

  it('maps the full ASCII code 23PEN to the canonical 23PEÑ', () => {
    // Evita la tienda duplicada: el código completo con N debe resolver al canónico con Ñ
    expect(norm('23PEN')).toBe('23PEÑ');
    expect(norm('23pen')).toBe('23PEÑ');
    expect(norm('23PEÑ')).toBe('23PEÑ');
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

// ─── poolPendiente ──────────────────────────────────────────────────────────────
// Snapshot del pool de 2ª vuelta desde el tablero (Fase 3 PR3).

describe('poolPendiente', () => {
  const cal = (on: boolean, p: number, b = 0, ch = 0) => ({ on, p, b, c: 10, ch });

  it('marca como pendiente lo activo con carga que no está en ningún camión', () => {
    const calT = { A: cal(true, 3), B: cal(true, 2), C: cal(true, 1) };
    const asignaciones = { PAT1: [{ c: 'A' }] }; // solo A asignada
    const { leftover, asignadas } = poolPendiente(calT, asignaciones);
    expect(leftover.map(s => s.c).sort()).toEqual(['B', 'C']);
    expect(asignadas.has('A')).toBe(true);
    expect(leftover.find(s => s.c === 'B')).toMatchObject({ c: 'B', p: 2 });
  });

  it('una tienda asignada a un camión NO es pendiente aunque el camión no se cierre', () => {
    const calT = { A: cal(true, 3), B: cal(true, 2) };
    const asignaciones = { PAT1: [{ c: 'A' }], PAT2: [{ c: 'B' }] }; // todo asignado
    const { leftover } = poolPendiente(calT, asignaciones);
    expect(leftover).toEqual([]);
  });

  it('ignora tiendas inactivas o sin carga', () => {
    const calT = { A: cal(false, 5), B: cal(true, 0, 0, 0), C: cal(true, 0, 4) };
    const { leftover } = poolPendiente(calT, {});
    // A inactiva → fuera; B sin carga → fuera; C con bultos → pendiente
    expect(leftover.map(s => s.c)).toEqual(['C']);
  });

  it('cuenta chocolate (ch) como carga', () => {
    const calT = { A: cal(true, 0, 0, 2) };
    const { leftover } = poolPendiente(calT, {});
    expect(leftover).toEqual([{ c: 'A', p: 0, b: 0, ch: 2 }]);
  });
});
