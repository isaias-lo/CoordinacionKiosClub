import { describe, it, expect } from 'vitest';
import { grupoCongelados } from '../congeladosPool';

describe('grupoCongelados', () => {
  it('congelados-regiones → fal (Regiones/Nacional), ignora el sector', () => {
    expect(grupoCongelados('congelados-regiones', 'Corredor Norte')).toBe('fal');
    expect(grupoCongelados('congelados-regiones', 'Costa')).toBe('fal');
    expect(grupoCongelados('congelados-regiones', undefined)).toBe('fal');
  });

  // Antes esto se preguntaba por REGIÓN contra 'VR'/'V' — el vocabulario del catálogo de
  // Santiago. Pero acá llega el de rutas, que escribe 'Valparaíso', así que la rama nunca se
  // ejecutaba y las cinco tiendas de la V Región caían en 'rm'. Preguntarle al sector la arregla.
  it('congelados-santiago con sector Costa → costa', () => {
    expect(grupoCongelados('congelados-santiago', 'Costa')).toBe('costa');
  });

  it('congelados-santiago con un corredor de Santiago → rm', () => {
    expect(grupoCongelados('congelados-santiago', 'Corredor Oriente')).toBe('rm');
    expect(grupoCongelados('congelados-santiago', 'Las Condes')).toBe('rm');
  });

  it('congelados-santiago con sector de Regiones → fal', () => {
    expect(grupoCongelados('congelados-santiago', 'Región Sur')).toBe('fal');
    expect(grupoCongelados('congelados-santiago', 'Región')).toBe('fal');
  });

  it('congelados-santiago sin sector → rm (default seguro, como antes)', () => {
    expect(grupoCongelados('congelados-santiago', undefined)).toBe('rm');
    expect(grupoCongelados('congelados-santiago', '')).toBe('rm');
  });
});
