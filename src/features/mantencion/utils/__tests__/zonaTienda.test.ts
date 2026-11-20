import { describe, it, expect } from 'vitest';
import { etiquetaZona, etiquetaZonaDeTienda, zonaDeTienda, ZONAS_MANTENCION }
  from '../zonaTienda';

describe('zonaDeTienda', () => {
  it('los corredores de Santiago son RM', () => {
    expect(zonaDeTienda('Corredor Oriente')).toBe('santiago');
    expect(zonaDeTienda('Corredor Providencia')).toBe('santiago');
  });

  it('Costa es Costa', () => {
    expect(zonaDeTienda('Costa')).toBe('costa');
  });

  it('Región Sur y Región Norte salen del sector', () => {
    expect(zonaDeTienda('Región Sur')).toBe('sur');
    expect(zonaDeTienda('Región Norte')).toBe('norte');
  });

  it('«Región» a secas sale de la latitud contra la del CD', () => {
    // El CD está en -33,4126. Más al sur (número menor) es sur; más al norte, norte.
    expect(zonaDeTienda('Región', -36.8)).toBe('sur');     // Chillán
    expect(zonaDeTienda('Región', -23.6)).toBe('norte');   // Antofagasta
  });

  it('«Región» sin latitud cae en sur, que es lo más común', () => {
    expect(zonaDeTienda('Región')).toBe('sur');
  });

  it('sin sector no se inventa una zona', () => {
    expect(zonaDeTienda('')).toBeNull();
    expect(zonaDeTienda(null)).toBeNull();
    expect(zonaDeTienda(undefined)).toBeNull();
  });
});

describe('etiquetaZona', () => {
  it('traduce las cuatro a como se llaman en Mantención', () => {
    expect(ZONAS_MANTENCION.map(etiquetaZona))
      .toEqual(['RM', 'Costa', 'Ruta Sur', 'Ruta Norte']);
  });

  it('una tienda sin zona se muestra como «Sin zona», no se esconde', () => {
    expect(etiquetaZonaDeTienda(null)).toBe('Sin zona');
    expect(etiquetaZonaDeTienda('Corredor Norte')).toBe('RM');
  });
});
