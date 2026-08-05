import { describe, it, expect } from 'vitest';
import { stampFromFecha } from '../helpers';

describe('stampFromFecha', () => {
  it('convierte DD/MM/YYYY a DDMMYYYY', () => {
    expect(stampFromFecha('04/08/2026')).toBe('04082026');
    expect(stampFromFecha('31/12/2026')).toBe('31122026');
  });

  it('convierte ISO YYYY-MM-DD a DDMMYYYY', () => {
    expect(stampFromFecha('2026-08-04')).toBe('04082026');
  });

  it('rellena con ceros día/mes de un solo dígito', () => {
    expect(stampFromFecha('4/8/2026')).toBe('04082026');
    expect(stampFromFecha('2026-8-4')).toBe('04082026');
  });

  it('mismo despacho → mismo stamp (determinista, sin importar cuándo se registre)', () => {
    // El bug era usar `now`: registrar el 04 o el 05 daba stamps distintos para el MISMO despacho.
    expect(stampFromFecha('04/08/2026')).toBe(stampFromFecha('2026-08-04'));
  });

  it('entrada vacía/rara → solo dígitos', () => {
    expect(stampFromFecha('')).toBe('');
    expect(stampFromFecha(null as unknown as string)).toBe('');
  });
});
