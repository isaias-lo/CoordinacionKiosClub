import { describe, it, expect } from 'vitest';
import { grupoCongelados } from '../congeladosPool';

describe('grupoCongelados', () => {
  it('congelados-regiones → fal (Regiones/Nacional), ignora la región', () => {
    expect(grupoCongelados('congelados-regiones', 'RM')).toBe('fal');
    expect(grupoCongelados('congelados-regiones', 'VR')).toBe('fal');
    expect(grupoCongelados('congelados-regiones', undefined)).toBe('fal');
  });

  it('congelados-santiago con región Viña/Costa (VR/V) → costa', () => {
    expect(grupoCongelados('congelados-santiago', 'VR')).toBe('costa');
    expect(grupoCongelados('congelados-santiago', 'V')).toBe('costa');
  });

  it('congelados-santiago con región RM (u otra) → rm', () => {
    expect(grupoCongelados('congelados-santiago', 'RM')).toBe('rm');
    expect(grupoCongelados('congelados-santiago', 'X')).toBe('rm');
  });

  it('congelados-santiago sin región → rm (default seguro)', () => {
    expect(grupoCongelados('congelados-santiago', undefined)).toBe('rm');
  });
});
