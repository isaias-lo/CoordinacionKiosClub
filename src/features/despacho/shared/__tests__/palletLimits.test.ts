import { describe, it, expect } from 'vitest';
import { MAX_ALTO_CM, excedeAltoMax } from '../palletLimits';

describe('palletLimits — límite de altura de pallets en bodega', () => {
  it('MAX_ALTO_CM es 185 cm', () => {
    expect(MAX_ALTO_CM).toBe(185);
  });

  it('excedeAltoMax es false para alturas dentro del límite', () => {
    expect(excedeAltoMax(184)).toBe(false);
    expect(excedeAltoMax(185)).toBe(false);
    expect(excedeAltoMax(0)).toBe(false);
  });

  it('excedeAltoMax es true al superar el límite', () => {
    expect(excedeAltoMax(186)).toBe(true);
    expect(excedeAltoMax(200)).toBe(true);
  });
});
