import { describe, it, expect } from 'vitest';
import { codigoRuta } from '../codigoRuta';

describe('codigoRuta', () => {
  it('formato RUTA-DDMMYY-NN (1-based, 2 dígitos)', () => {
    expect(codigoRuta('2026-08-11', 0)).toBe('RUTA-110826-01');
    expect(codigoRuta('2026-08-11', 1)).toBe('RUTA-110826-02');
    expect(codigoRuta('2026-08-11', 9)).toBe('RUTA-110826-10');
  });
  it('el consecutivo distingue camiones cerrados uno a uno (no repite -01)', () => {
    // -21 cerrado con offset 0 → -01 ; -91 cerrado con offset 1 → -02
    expect(codigoRuta('2026-08-11', 0)).not.toBe(codigoRuta('2026-08-11', 1));
    expect(codigoRuta('2026-08-11', 0)).toBe('RUTA-110826-01');
    expect(codigoRuta('2026-08-11', 1)).toBe('RUTA-110826-02');
  });
  it('otra fecha → otro prefijo', () => {
    expect(codigoRuta('2026-12-05', 0)).toBe('RUTA-051226-01');
  });
});
