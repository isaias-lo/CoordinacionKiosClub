import { describe, it, expect } from 'vitest';
import { esSinPesar } from '../sinPesar';

describe('esSinPesar — detección de items agregados sin pesar', () => {
  it('true cuando peso es 0', () => {
    expect(esSinPesar({ peso: 0 })).toBe(true);
  });

  it('true cuando peso es undefined', () => {
    expect(esSinPesar({ peso: undefined })).toBe(true);
  });

  it('true cuando peso es null', () => {
    expect(esSinPesar({ peso: null })).toBe(true);
  });

  it('true cuando peso es negativo', () => {
    expect(esSinPesar({ peso: -5 })).toBe(true);
  });

  it('false cuando peso es 20', () => {
    expect(esSinPesar({ peso: 20 })).toBe(false);
  });

  it('false cuando peso es 100', () => {
    expect(esSinPesar({ peso: 100 })).toBe(false);
  });
});
