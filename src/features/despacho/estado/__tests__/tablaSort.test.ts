import { describe, it, expect } from 'vitest';
import { compareCells, dateMs } from '../tablaSort';

describe('dateMs', () => {
  it('parsea DD/MM/YYYY', () => {
    expect(dateMs('30/07/2026')).toBe(new Date(2026, 6, 30).getTime());
    expect(dateMs('01/01/2026') < dateMs('02/01/2026')).toBe(true);
  });
  it('parsea ISO', () => {
    expect(dateMs('2026-07-31T03:37:00Z')).toBe(Date.parse('2026-07-31T03:37:00Z'));
  });
  it('valor inválido → -Infinity (queda al final del orden asc)', () => {
    expect(dateMs('')).toBe(-Infinity);
    expect(dateMs(null)).toBe(-Infinity);
  });
});

describe('compareCells', () => {
  it('ordena columnas de fecha cronológicamente (no alfabético)', () => {
    // '09/...' es alfabéticamente mayor que '10/...' pero cronológicamente menor
    expect(compareCells('fecha', '09/08/2026', '10/07/2026') > 0).toBe(true);
    expect(compareCells('created_at', '2026-07-29T10:00:00Z', '2026-07-30T10:00:00Z') < 0).toBe(true);
  });
  it('ordena numéricamente cuando ambos son números', () => {
    expect(compareCells('peso_kg', '9', '100') < 0).toBe(true);   // 9 < 100 (no '9' > '100')
    expect(compareCells('pallets_sent', '2', '2')).toBe(0);
  });
  it('ordena texto con locale es', () => {
    expect(compareCells('tienda', 'Alto', 'Zapallar') < 0).toBe(true);
    expect(compareCells('tienda', 'Ñuñoa', 'Zapallar') < 0).toBe(true);
  });
});
