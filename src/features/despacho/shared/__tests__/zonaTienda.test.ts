import { describe, it, expect } from 'vitest';
import { zonaDeTienda, etiquetaTipoTienda } from '../zonaTienda';

// Los casos salen del catálogo REAL (tabla `tiendas`, 02/10/2026): son los pares
// sector_comuna / corredor que de verdad existen, no combinaciones inventadas.

describe('zonaDeTienda — las cuatro zonas, con tiendas reales', () => {
  it('RM: cualquier corredor de Santiago', () => {
    expect(zonaDeTienda({ sector: 'Corredor Norte', corredor: 'Oriente' })).toBe('RM');      // 01TPS
    expect(zonaDeTienda({ sector: 'Corredor Oriente', corredor: 'Oriente' })).toBe('RM');    // 16PQA
    expect(zonaDeTienda({ sector: 'Corredor Poniente', corredor: 'Norte' })).toBe('RM');
    expect(zonaDeTienda({ sector: 'Corredor Sur', corredor: 'Sur' })).toBe('RM');
  });

  it('RM: las comunas sueltas que el catálogo trae como sector', () => {
    // Existen así en la tabla y no son región: no pueden caer en otra zona.
    expect(zonaDeTienda({ sector: 'Las Condes', corredor: 'Sector Oriente' })).toBe('RM');
    expect(zonaDeTienda({ sector: 'Ñuñoa', corredor: 'Sector Oriente / Centro-Oriente' })).toBe('RM');
    expect(zonaDeTienda({ sector: 'Santiago', corredor: 'Corredor central del casco historico' })).toBe('RM');
  });

  it('COSTA: el sector manda, aunque el corredor diga «V Región»', () => {
    // 08RNC Reñaca. Si mandara el corredor, esta saldría como región.
    expect(zonaDeTienda({ sector: 'Costa', corredor: 'V Región (Ruta 68/F-30-E)' })).toBe('COSTA');
    expect(zonaDeTienda({ sector: 'Costa', corredor: 'V Región (Ruta 68)' })).toBe('COSTA');
  });

  it('REGIÓN NORTE: lo dice el corredor', () => {
    expect(zonaDeTienda({ sector: 'Región', corredor: 'Norte (Ruta 5 Norte)' })).toBe('REGIÓN NORTE');
    expect(zonaDeTienda({ sector: 'Región', corredor: 'Norte Grande' })).toBe('REGIÓN NORTE');   // 42ANP
  });

  it('REGIÓN SUR: lo dice el corredor, en sus cuatro escrituras', () => {
    expect(zonaDeTienda({ sector: 'Región', corredor: 'Sur (Final Ruta 5)' })).toBe('REGIÓN SUR');   // 47PTV
    expect(zonaDeTienda({ sector: 'Región', corredor: 'Sur (Ruta 160)' })).toBe('REGIÓN SUR');
    expect(zonaDeTienda({ sector: 'Región', corredor: 'Sur (Ruta 5 Sur)' })).toBe('REGIÓN SUR');     // 36CHL
    expect(zonaDeTienda({ sector: 'Región', corredor: 'Sur (Ruta 5 / Interlagos)' })).toBe('REGIÓN SUR');
  });

  it('REGIÓN SUR: «XIV Región / Los Ríos» es del sur y NO empieza con «sur»', () => {
    // El caso que rompe la regla ingenua de mirar solo el prefijo «Sur».
    expect(zonaDeTienda({ sector: 'Región', corredor: 'XIV Región / Los Ríos (Ruta 5 Sur)' }))
      .toBe('REGIÓN SUR');
  });

  it('un sector que ya trae la respuesta no necesita el corredor', () => {
    expect(zonaDeTienda({ sector: 'Región Sur', corredor: 'Sur (Ruta 5 / Interlagos)' })).toBe('REGIÓN SUR');
    expect(zonaDeTienda({ sector: 'Región Sur' })).toBe('REGIÓN SUR');
  });

  it('de región pero sin saber de cuál: «REGIÓN» a secas, no una adivinanza', () => {
    expect(zonaDeTienda({ sector: 'Región', corredor: '' })).toBe('REGIÓN');
    expect(zonaDeTienda({ sector: 'Región' })).toBe('REGIÓN');
  });

  it('SIN SECTOR NO SE INVENTA: null, y la etiqueta no dibuja el rótulo', () => {
    // Son 3 tiendas del catálogo. Poner «RM» por defecto sería escribir en el papel algo que nadie
    // verificó, y esa hoja la lee quien carga el camión.
    expect(zonaDeTienda({ sector: '', corredor: 'Oriente' })).toBeNull();
    expect(zonaDeTienda({ sector: '   ' })).toBeNull();
    expect(zonaDeTienda({})).toBeNull();
    expect(zonaDeTienda(null)).toBeNull();
    expect(zonaDeTienda(undefined)).toBeNull();
  });

  it('aguanta acentos, mayúsculas y espacios de sobra — el catálogo se carga a mano', () => {
    expect(zonaDeTienda({ sector: '  REGION  ', corredor: 'SUR (RUTA 160)' })).toBe('REGIÓN SUR');
    expect(zonaDeTienda({ sector: 'costa' })).toBe('COSTA');
    expect(zonaDeTienda({ sector: 'Región' , corredor: '  norte grande ' })).toBe('REGIÓN NORTE');
  });
});

describe('etiquetaTipoTienda', () => {
  it('los tres tipos que se despachan', () => {
    expect(etiquetaTipoTienda('MALL')).toBe('MALL');
    expect(etiquetaTipoTienda('STRIPCENTER')).toBe('STRIPCENTER');
    expect(etiquetaTipoTienda('TIENDA')).toBe('TIENDA');
  });

  it('normaliza como viene del catálogo', () => {
    expect(etiquetaTipoTienda('Mall')).toBe('MALL');
    expect(etiquetaTipoTienda('  strip center ')).toBe('STRIPCENTER');
    expect(etiquetaTipoTienda('StripCenter')).toBe('STRIPCENTER');
  });

  it('«punto» y «oficina» NO son tiendas de abastecimiento: sin rótulo', () => {
    // Son 2 del catálogo. Imprimir «PUNTO» en la etiqueta no le dice nada a quien carga.
    expect(etiquetaTipoTienda('punto')).toBeNull();
    expect(etiquetaTipoTienda('oficina')).toBeNull();
  });

  it('sin dato, sin rótulo', () => {
    expect(etiquetaTipoTienda('')).toBeNull();
    expect(etiquetaTipoTienda(null)).toBeNull();
    expect(etiquetaTipoTienda(undefined)).toBeNull();
  });
});
