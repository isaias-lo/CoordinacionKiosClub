import { describe, it, expect } from 'vitest';
import { zonaForStore } from '../tiendasAdelanto';

describe('zonaForStore', () => {
  it('tienda RM (region "RM") → rm', () => {
    expect(zonaForStore('32BNV')).toBe('rm'); // Buenaventura, RM
    expect(zonaForStore('35BN2')).toBe('rm'); // Buenaventura 2, RM
  });

  it('tienda de Costa (z "Costa") → costa', () => {
    expect(zonaForStore('37VIN')).toBe('costa'); // Viña del Mar
    expect(zonaForStore('33CON')).toBe('costa'); // Concón
  });

  it('tienda de región (z "Región", region ≠ RM) → fal', () => {
    expect(zonaForStore('39PSB')).toBe('fal'); // La Serena, Coquimbo
    expect(zonaForStore('41ANA')).toBe('fal'); // Antofagasta
  });

  it('código desconocido o vacío → rm (default seguro)', () => {
    expect(zonaForStore('')).toBe('rm');
    expect(zonaForStore('NOEXISTE')).toBe('rm');
  });

  it('normaliza a mayúsculas antes de buscar', () => {
    expect(zonaForStore('37vin')).toBe('costa');
  });
});
