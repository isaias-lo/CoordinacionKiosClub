import { describe, it, expect } from 'vitest';
import { tipoDeActividad } from '../feedActividad';

describe('tipoDeActividad', () => {
  it('RM/Costa escribe el tipo con mayúscula inicial', () => {
    expect(tipoDeActividad({ contenido: 'Comida' })).toBe('Comida');
    expect(tipoDeActividad({ contenido: 'Hogar-Aseo' })).toBe('Hogar · Aseo');
    expect(tipoDeActividad({ contenido: 'Mixto' })).toBe('Comida · Hogar');
    expect(tipoDeActividad({ contenido: 'Chocolate' })).toBe('Chocolate');
  });
  it('Nacional manda el código en minúscula', () => {
    expect(tipoDeActividad({ contenido: 'comida-hogar-aseo' })).toBe('Comida · Hogar · Aseo');
    expect(tipoDeActividad({ contenido: 'aseo' })).toBe('Aseo');
  });
  it('un evento viejo sin tipo queda en blanco, salvo el chocolate por su etiqueta', () => {
    expect(tipoDeActividad({ contenido: null, label: 'P3' })).toBeNull();
    expect(tipoDeActividad({ label: 'CH12' })).toBe('Chocolate');
    expect(tipoDeActividad(null)).toBeNull();
    expect(tipoDeActividad({ contenido: '  ' })).toBeNull();
  });
});
