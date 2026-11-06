import { describe, it, expect } from 'vitest';
import {
  AMARILLO, CIAN, colorAlternado, describirEsqueleto, filasEsqueleto, formulasDe,
} from '../esqueletoOlas';
import type { MovimientoPlanilla } from '../armarPlanilla';

function mov(p: Partial<MovimientoPlanilla> = {}): MovimientoPlanilla {
  return {
    cod: '57CAS', seccion: 'Chocolates', registros: 18, picker: 'Diego Farr',
    cuenta: 'Pickers 11', asignadoEn: '2026-11-11 11:00:00', validadoEn: null,
    estado: 'assigned', ...p,
  };
}

describe('colorAlternado', () => {
  it('después de cian va amarillo y al revés', () => {
    expect(colorAlternado(CIAN)).toBe(AMARILLO);
    expect(colorAlternado(AMARILLO)).toBe(CIAN);
  });

  it('no le importan las mayúsculas del hex', () => {
    expect(colorAlternado('#ffff00')).toBe(CIAN);
  });

  it('sin color anterior arranca en cian', () => {
    expect(colorAlternado(null)).toBe(CIAN);
    expect(colorAlternado(undefined)).toBe(CIAN);
    expect(colorAlternado('')).toBe(CIAN);
  });

  it('un color que no es ninguno de los dos se trata como «no amarillo»', () => {
    // Lo único que importa es que el día nuevo no comparta color con el de arriba.
    expect(colorAlternado('#FFFFFF')).toBe(AMARILLO);
  });

  it('nunca repite: alternar dos veces vuelve al mismo', () => {
    expect(colorAlternado(colorAlternado(CIAN))).toBe(CIAN);
    expect(colorAlternado(colorAlternado(AMARILLO))).toBe(AMARILLO);
  });

  it('la cadena no se rompe al cambiar de mes', () => {
    // Por paridad de la fecha, el 31 y el 1 son los dos impares y saldrían iguales. Mirando al
    // día de arriba, no.
    let c = CIAN;
    const serie = [];
    for (const _ of ['30', '31', '01', '02']) { c = colorAlternado(c); serie.push(c); }
    expect(serie).toEqual([AMARILLO, CIAN, AMARILLO, CIAN]);
    for (let i = 1; i < serie.length; i++) expect(serie[i]).not.toBe(serie[i - 1]);
  });
});

describe('filasEsqueleto: la forma del bloque', () => {
  it('tres filas por tienda, con el código SOLO en la primera', () => {
    const f = filasEsqueleto(['51SER', '39PSB'], []);
    expect(f.slice(0, 6)).toEqual([
      { tienda: '51SER', seccion: 'COMIDA' },
      { tienda: '',      seccion: 'ASEO ' },
      { tienda: '',      seccion: 'HOGAR' },
      { tienda: '39PSB', seccion: 'COMIDA' },
      { tienda: '',      seccion: 'ASEO ' },
      { tienda: '',      seccion: 'HOGAR' },
    ]);
  });

  it('«ASEO » conserva su espacio final', () => {
    // Es lo que la hoja tiene. El calce es normalizado así que limpiarlo no rompería acá, pero
    // no se sabe qué filtros de esa planilla comparan la columna C en crudo.
    const f = filasEsqueleto(['51SER'], []);
    expect(f[1].seccion).toBe('ASEO ');
    expect(f[1].seccion.endsWith(' ')).toBe(true);
  });

  it('respeta el orden del calendario', () => {
    const f = filasEsqueleto(['27MCH', '01TPS', '51SER'], []);
    expect(f.filter(x => x.tienda).map(x => x.tienda)).toEqual(['27MCH', '01TPS', '51SER']);
  });

  it('una tienda repetida en el calendario no duplica su grupo', () => {
    const f = filasEsqueleto(['51SER', '39PSB', '51SER'], []);
    expect(f.filter(x => x.tienda).map(x => x.tienda)).toEqual(['51SER', '39PSB']);
  });

  it('una tienda sin carga igual lleva sus tres filas', () => {
    // Si no, después habría que insertar en el medio. En la hoja de hoy las tiendas sin carga
    // están igual, con sus tres filas vacías.
    const f = filasEsqueleto(['75PUC'], []);
    expect(f.filter(x => x.seccion !== 'CONGELADOS' && x.seccion !== 'CHOCOLATES')).toHaveLength(3);
  });
});

describe('filasEsqueleto: chocolates y congelados', () => {
  it('una fila de chocolates por PERSONA distinta, no por tienda', () => {
    const f = filasEsqueleto(['57CAS', '28TEM', '60PBL'], [
      mov({ cod: '57CAS', picker: 'Diego Farr' }),
      mov({ cod: '28TEM', picker: 'Valentina Conejera' }),
      mov({ cod: '60PBL', picker: 'Diego Farr' }),
    ]);
    expect(f.filter(x => x.seccion === 'CHOCOLATES')).toHaveLength(2);
  });

  it('sin nadie en chocolates igual va una fila, para poder completarla a mano', () => {
    const f = filasEsqueleto(['57CAS'], []);
    expect(f.filter(x => x.seccion === 'CHOCOLATES')).toHaveLength(1);
  });

  it('un chocolate anulado no suma una fila', () => {
    const f = filasEsqueleto(['57CAS'], [mov({ estado: 'cancel', picker: 'Diego Farr' })]);
    expect(f.filter(x => x.seccion === 'CHOCOLATES')).toHaveLength(1);
  });

  it('siempre dos filas de congelados, en blanco', () => {
    // Esta planilla no registra congelados; se crean vacías para que alguien las complete.
    const f = filasEsqueleto(['57CAS'], []);
    const cong = f.filter(x => x.seccion === 'CONGELADOS');
    expect(cong).toHaveLength(2);
    expect(cong.every(x => x.tienda === '')).toBe(true);
  });

  it('chocolates y congelados van al FINAL y sin tienda', () => {
    const f = filasEsqueleto(['57CAS', '28TEM'], [mov()]);
    const cola = f.slice(-3);
    expect(cola.map(x => x.seccion)).toEqual(['CHOCOLATES', 'CONGELADOS', 'CONGELADOS']);
    expect(cola.every(x => x.tienda === '')).toBe(true);
  });

  it('el total de un día de 29 tiendas da el tamaño que tiene la hoja', () => {
    // 29 × 3 + 2 chocolates + 2 congelados = 91, que es exactamente el bloque del 05/11.
    const cods = Array.from({ length: 29 }, (_, i) => `T${String(i).padStart(2, '0')}`);
    const f = filasEsqueleto(cods, [
      mov({ picker: 'Diego Farr' }), mov({ picker: 'Valentina Conejera' }),
    ]);
    expect(f).toHaveLength(91);
  });
});

describe('formulasDe', () => {
  it('T es la llave con la que el bono busca', () => {
    expect(formulasDe(36400).T).toBe('=CONCATENATE(A36400;S36400)');
  });

  it('U mira la fila de ARRIBA, que es como se arrastra la tienda', () => {
    const u = formulasDe(36400).U;
    expect(u).toContain('$B36400');
    expect(u).toContain('U36399');   // la de arriba
  });

  it('U lleva la expresión que saca el número del código', () => {
    // '51SER' → 'SER'. Con la barra mal escapada la fórmula entra pero deja de recortar.
    expect(formulasDe(100).U).toContain('REGEXREPLACE($B100;"^\\d+";"")');
  });

  it('X es la duración', () => {
    expect(formulasDe(36400).X).toBe('=W36400-V36400');
  });
});

describe('describirEsqueleto', () => {
  it('dice en palabras lo que se va a crear', () => {
    const f = filasEsqueleto(['57CAS', '28TEM'], [mov()]);
    expect(describirEsqueleto(f)).toBe(
      '9 filas: 2 tiendas × 3 secciones, 1 de chocolates y 2 de congelados en blanco');
  });

  it('una sola tienda va en singular', () => {
    expect(describirEsqueleto(filasEsqueleto(['57CAS'], []))).toContain('1 tienda ×');
  });
});
