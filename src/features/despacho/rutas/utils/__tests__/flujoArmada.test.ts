import { describe, it, expect } from 'vitest';
import { grupoArmada } from '../flujoArmada';

describe('grupoArmada', () => {
  it('fuente regiones → fal', () => {
    expect(grupoArmada('regiones', 'RM')).toBe('fal');
    expect(grupoArmada('regiones', null)).toBe('fal');
  });
  it('región Viña/Costa → costa', () => {
    expect(grupoArmada('santiago', 'VR')).toBe('costa');
    expect(grupoArmada('santiago', 'V')).toBe('costa');
  });
  it('resto → rm', () => {
    expect(grupoArmada('santiago', 'RM')).toBe('rm');
    expect(grupoArmada(undefined, undefined)).toBe('rm');
    expect(grupoArmada('santiago', null)).toBe('rm');
  });
});
