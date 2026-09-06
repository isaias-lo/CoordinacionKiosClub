import { describe, it, expect } from 'vitest';
import { desarmarDireccion, regionDelCatalogo, type ComponenteGoogle } from '../direccionGoogle';

const c = (long_name: string, ...types: string[]): ComponenteGoogle => ({ long_name, short_name: long_name, types });

describe('regionDelCatalogo', () => {
  // El catálogo escribe 'Araucanía', no 'Región de La Araucanía'. Copiar a Google tal cual
  // agregaría una tercera forma de escribir lo mismo — el problema que ya tiene 60PBL.
  it('traduce a como lo escribe el catálogo', () => {
    expect(regionDelCatalogo('Región Metropolitana de Santiago')).toBe('RM');
    expect(regionDelCatalogo('Región de La Araucanía')).toBe('Araucanía');
    expect(regionDelCatalogo('Región del Biobío')).toBe('Biobío');
    expect(regionDelCatalogo('Región de Los Lagos')).toBe('Los Lagos');
    expect(regionDelCatalogo('Región de Valparaíso')).toBe('Valparaíso');
    expect(regionDelCatalogo('Región de Ñuble')).toBe('Ñuble');
  });

  it("O'Higgins tiene nombre largo en Google y corto en el catálogo", () => {
    expect(regionDelCatalogo("Región del Libertador General Bernardo O'Higgins")).toBe("O'Higgins");
  });

  // Estas son las que ya están en el catálogo: el resultado tiene que coincidir EXACTO.
  it('coincide con los valores que ya existen en el catálogo', () => {
    const enCatalogo = ['RM', 'Antofagasta', 'Araucanía', 'Biobío', 'Coquimbo', 'Los Lagos', 'Los Ríos', 'Maule', 'Ñuble', "O'Higgins", 'Valparaíso'];
    const deGoogle = ['Región Metropolitana', 'Región de Antofagasta', 'Región de La Araucanía',
      'Región del Biobío', 'Región de Coquimbo', 'Región de Los Lagos', 'Región de Los Ríos',
      'Región del Maule', 'Región de Ñuble', "Región del Libertador General Bernardo O'Higgins",
      'Región de Valparaíso'];
    expect(deGoogle.map(regionDelCatalogo)).toEqual(enCatalogo);
  });

  it('una región que no conoce no se inventa: devuelve el nombre sin el prefijo', () => {
    expect(regionDelCatalogo('Región de Marte')).toBe('Marte');
  });

  it('vacío o nulo no rompe', () => {
    expect(regionDelCatalogo('')).toBe('');
    expect(regionDelCatalogo(null)).toBe('');
  });
});

describe('desarmarDireccion', () => {
  // El caso que motiva todo: Sendu pide calle y número POR SEPARADO, y hoy se escriben a mano.
  it('separa la calle del número', () => {
    const r = desarmarDireccion([
      c('235', 'street_number'),
      c('Avenida Ossa', 'route'),
      c('La Reina', 'locality'),
      c('Región Metropolitana', 'administrative_area_level_1'),
      c('Chile', 'country'),
    ]);
    expect(r).toEqual({ calle: 'Avenida Ossa', numero: '235', comuna: 'La Reina', region: 'RM' });
  });

  // En Chile Google usa `locality` o `administrative_area_level_3` según la dirección.
  it('toma la comuna de administrative_area_level_3 cuando no hay locality', () => {
    const r = desarmarDireccion([
      c('Ignacio Serrano', 'route'),
      c('Castro', 'administrative_area_level_3'),
      c('Región de Los Lagos', 'administrative_area_level_1'),
    ]);
    expect(r.comuna).toBe('Castro');
    expect(r.region).toBe('Los Lagos');
  });

  it('prefiere locality si vienen los dos', () => {
    const r = desarmarDireccion([
      c('Ñuñoa', 'locality'),
      c('Provincia de Santiago', 'administrative_area_level_3'),
    ]);
    expect(r.comuna).toBe('Ñuñoa');
  });

  it('una dirección sin número deja el número vacío, no rompe', () => {
    const r = desarmarDireccion([c('Camino El Venado', 'route'), c('San Pedro de la Paz', 'locality')]);
    expect(r).toMatchObject({ calle: 'Camino El Venado', numero: '', comuna: 'San Pedro de la Paz' });
  });

  it('sin componentes devuelve todo vacío', () => {
    expect(desarmarDireccion(null)).toEqual({ calle: '', numero: '', comuna: '', region: '' });
  });
});
