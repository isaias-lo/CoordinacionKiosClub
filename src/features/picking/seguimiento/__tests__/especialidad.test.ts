import { describe, it, expect } from 'vitest';
import { especialidadDeOrigin, ESPECIALIDADES, NOMBRE_ESPECIALIDAD } from '../especialidad';

describe('especialidadDeOrigin', () => {
  it('reconoce las tres', () => {
    expect(especialidadDeOrigin('Abastecimiento Comida 41ANA 16/11/2026')).toBe('seco');
    expect(especialidadDeOrigin('Abastecimiento Aseo 41ANA')).toBe('seco');
    expect(especialidadDeOrigin('Abastecimiento Hogar 41ANA')).toBe('seco');
    expect(especialidadDeOrigin('Abastecimiento Chocolates 41ANA')).toBe('chocolates');
    expect(especialidadDeOrigin('Abastecimiento Congelados 58TAM 01/10/2026')).toBe('congelados');
  });

  it('acepta «Apertura» en el medio', () => {
    expect(especialidadDeOrigin('Abastecimiento Apertura Comida 39PSB')).toBe('seco');
    expect(especialidadDeOrigin('Abastecimiento Apertura Hogar 39PSB')).toBe('seco');
  });

  it('acepta el singular «Chocolate», que la hoja también usa', () => {
    expect(especialidadDeOrigin('Abastecimiento Chocolate 29CFL')).toBe('chocolates');
  });

  it('no distingue mayúsculas', () => {
    expect(especialidadDeOrigin('ABASTECIMIENTO CONGELADOS 58TAM')).toBe('congelados');
    expect(especialidadDeOrigin('abastecimiento chocolates 29CFL')).toBe('chocolates');
  });

  it('lo que no calza es SECO, no un cuarto grupo', () => {
    // «Agregado», «Pack» y «Solicitud de tienda» son abastecimiento de seco con el origen
    // escrito a mano: 179 movimientos del mes. Un grupo «otro» los sacaría de la vista.
    for (const o of ['Agregado', 'AGREGADO', 'Pack', 'Solicitud de tienda 43CUR', 'Regularización', ''])
      expect(especialidadDeOrigin(o)).toBe('seco');
  });

  it('un origen ausente no rompe', () => {
    expect(especialidadDeOrigin(null)).toBe('seco');
    expect(especialidadDeOrigin(undefined)).toBe('seco');
  });

  it('«Congelados» dentro de otro texto no se confunde sin «Abastecimiento» delante', () => {
    // El prefijo es parte del patrón: un comentario suelto no cambia la especialidad.
    expect(especialidadDeOrigin('Devolución de Congelados')).toBe('seco');
  });

  it('las tres tienen nombre para pantalla', () => {
    for (const e of ESPECIALIDADES) expect(NOMBRE_ESPECIALIDAD[e]).toBeTruthy();
    expect(ESPECIALIDADES).toHaveLength(3);
  });
});
