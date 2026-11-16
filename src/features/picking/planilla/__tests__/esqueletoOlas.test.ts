import { describe, it, expect } from 'vitest';
import {
  AMARILLO, CIAN, FALABELLA_EN_HOJA, FALABELLA_GRAFIAS_VIEJAS, SECCION_EN_HOJA,
  SECCIONES_A_MANO, colorAlternado, describirEsqueleto,
  diaDeSemana, filaFalabella, filasEsqueleto, formulasDe,
} from '../esqueletoOlas';
import type { MovimientoPlanilla } from '../armarPlanilla';

// Los días que importan, medidos en la hoja el 10/11/2026. El MARTES es el día «sin nada raro»:
// no lleva fila de Falabella Full, así que es el que usan los casos que solo miran tiendas,
// chocolates y congelados — y por eso sus totales no cambian.
const LUNES = '2026-11-09';
const MARTES = '2026-11-10';
const MIERCOLES = '2026-11-11';
const JUEVES = '2026-11-05';

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
    const f = filasEsqueleto(['51SER', '39PSB'], [], MARTES);
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
    const f = filasEsqueleto(['51SER'], [], MARTES);
    expect(f[1].seccion).toBe('ASEO ');
    expect(f[1].seccion.endsWith(' ')).toBe(true);
  });

  it('respeta el orden del calendario', () => {
    const f = filasEsqueleto(['27MCH', '01TPS', '51SER'], [], MARTES);
    expect(f.filter(x => x.tienda).map(x => x.tienda)).toEqual(['27MCH', '01TPS', '51SER']);
  });

  it('una tienda repetida en el calendario no duplica su grupo', () => {
    const f = filasEsqueleto(['51SER', '39PSB', '51SER'], [], MARTES);
    expect(f.filter(x => x.tienda).map(x => x.tienda)).toEqual(['51SER', '39PSB']);
  });

  it('una tienda sin carga igual lleva sus tres filas', () => {
    // Si no, después habría que insertar en el medio. En la hoja de hoy las tiendas sin carga
    // están igual, con sus tres filas vacías.
    const f = filasEsqueleto(['75PUC'], [], MARTES);
    expect(f.filter(x => x.seccion !== 'CONGELADOS' && x.seccion !== 'CHOCOLATES')).toHaveLength(3);
  });
});

describe('filasEsqueleto: chocolates y congelados', () => {
  it('una fila de chocolates por PERSONA distinta, no por tienda', () => {
    const f = filasEsqueleto(['57CAS', '28TEM', '60PBL'], [
      mov({ cod: '57CAS', picker: 'Diego Farr' }),
      mov({ cod: '28TEM', picker: 'Valentina Conejera' }),
      mov({ cod: '60PBL', picker: 'Diego Farr' }),
    ], MARTES);
    expect(f.filter(x => x.seccion === 'CHOCOLATES')).toHaveLength(2);
  });

  it('sin nadie en chocolates igual va una fila, para poder completarla a mano', () => {
    const f = filasEsqueleto(['57CAS'], [], MARTES);
    expect(f.filter(x => x.seccion === 'CHOCOLATES')).toHaveLength(1);
  });

  it('un chocolate anulado no suma una fila', () => {
    const f = filasEsqueleto(['57CAS'], [mov({ estado: 'cancel', picker: 'Diego Farr' })], MARTES);
    expect(f.filter(x => x.seccion === 'CHOCOLATES')).toHaveLength(1);
  });

  it('siempre dos filas de congelados, en blanco', () => {
    // Esta planilla no registra congelados; se crean vacías para que alguien las complete.
    const f = filasEsqueleto(['57CAS'], [], MARTES);
    const cong = f.filter(x => x.seccion === 'CONGELADOS');
    expect(cong).toHaveLength(2);
    expect(cong.every(x => x.tienda === '')).toBe(true);
  });

  it('dos filas de congelados aunque el día sea chico: el número es la GENTE, no el tamaño', () => {
    // Son dos personas que se reparten todo el calendario del día. Cuando falta una se dejan
    // igual los dos recuadros y se completa un nombre — comprobado en la hoja, 17 días seguidos.
    for (const cods of [['57CAS'], ['57CAS', '28TEM'], Array.from({ length: 29 }, (_, i) => `T${i}`)]) {
      expect(filasEsqueleto(cods, [], MARTES).filter(x => x.seccion === 'CONGELADOS')).toHaveLength(2);
    }
  });

  it('chocolates y congelados van al FINAL y sin tienda', () => {
    const f = filasEsqueleto(['57CAS', '28TEM'], [mov()], MARTES);
    const cola = f.slice(-3);
    expect(cola.map(x => x.seccion)).toEqual(['CHOCOLATES', 'CONGELADOS', 'CONGELADOS']);
    expect(cola.every(x => x.tienda === '')).toBe(true);
  });

  it('el total de un día de 29 tiendas da el tamaño que tiene la hoja', () => {
    // 29 × 3 + 2 chocolates + 2 congelados = 91, que es exactamente el bloque del 05/11.
    const cods = Array.from({ length: 29 }, (_, i) => `T${String(i).padStart(2, '0')}`);
    const f = filasEsqueleto(cods, [
      mov({ picker: 'Diego Farr' }), mov({ picker: 'Valentina Conejera' }),
    ], MARTES);
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
    const f = filasEsqueleto(['57CAS', '28TEM'], [mov()], MARTES);
    expect(describirEsqueleto(f)).toBe(
      '9 filas: 2 tiendas × 3 secciones, 1 de chocolates y 2 de congelados en blanco');
  });

  it('una sola tienda va en singular', () => {
    expect(describirEsqueleto(filasEsqueleto(['57CAS'], [], MARTES))).toContain('1 tienda ×');
  });

  it('nombra la de Falabella Full solo cuando el día la lleva', () => {
    expect(describirEsqueleto(filasEsqueleto(['57CAS'], [], LUNES))).toContain('Falabella Full');
    expect(describirEsqueleto(filasEsqueleto(['57CAS'], [], MARTES))).not.toContain('Falabella');
  });
});

describe('diaDeSemana', () => {
  it('los días de esta semana, los mismos que tiene la hoja', () => {
    expect(diaDeSemana(LUNES)).toBe(1);
    expect(diaDeSemana(MARTES)).toBe(2);
    expect(diaDeSemana(MIERCOLES)).toBe(3);
    expect(diaDeSemana(JUEVES)).toBe(4);
  });

  it('avanza de uno en uno todo el mes: no se corre en ningún día', () => {
    // Pinchar un día suelto no detecta un off-by-one de zona horaria; la cadena completa sí. Si
    // `getDay()` local se colara en lugar de `getUTCDay()`, acá se vería el salto.
    let anterior = diaDeSemana('2026-11-01');
    expect(anterior).toBe(0);   // domingo
    for (let d = 2; d <= 30; d++) {
      const hoy = diaDeSemana(`2026-11-${String(d).padStart(2, '0')}`);
      expect(hoy).toBe((anterior! + 1) % 7);
      anterior = hoy;
    }
  });

  it('cruza el cambio de mes y el de año sin saltarse un día', () => {
    expect(diaDeSemana('2026-11-30')).toBe(1);   // lunes
    expect(diaDeSemana('2026-12-01')).toBe(2);   // martes
    expect(diaDeSemana('2026-12-31')).toBe(4);   // jueves
    expect(diaDeSemana('2027-01-01')).toBe(5);   // viernes
  });

  it('lo que no es una fecha da null, no un día cualquiera', () => {
    for (const x of ['', '  ', '10/11/2026', '2026-11', 'hoy', '2026-11-9', '2026/11/10']) {
      expect(diaDeSemana(x)).toBe(null);
    }
  });

  it('una fecha que no existe da null en vez de rodar a otro mes', () => {
    // `Date.UTC(2026, 12, 45)` no falla: cae en 2027. Devolvería un día plausible para una fecha
    // inexistente, que es la clase de error que no se ve.
    expect(diaDeSemana('2026-13-45')).toBe(null);
    expect(diaDeSemana('2026-02-30')).toBe(null);
    expect(diaDeSemana('2026-00-10')).toBe(null);
  });
});

describe('filaFalabella', () => {
  it('el lunes y el miércoles llevan LA MISMA grafía', () => {
    // Unificadas el 12/11/2026. Antes eran «Fala full» el lunes y «falabella full» el miércoles.
    expect(filaFalabella(LUNES)).toBe('FALABELLA FULL');
    expect(filaFalabella(MIERCOLES)).toBe('FALABELLA FULL');
    expect(filaFalabella(LUNES)).toBe(filaFalabella(MIERCOLES));
  });

  it('va en MAYÚSCULA, que es la regla que la hoja ya tiene para la columna C', () => {
    // COMIDA, ASEO , HOGAR, CHOCOLATES, CONGELADOS. Las dos de Falabella eran las únicas en
    // minúscula; ahora no hay ninguna.
    expect(FALABELLA_EN_HOJA).toBe(FALABELLA_EN_HOJA.toUpperCase());
    for (const s of Object.values(SECCION_EN_HOJA)) expect(s).toBe(s.toUpperCase());
  });

  it('las dos grafías viejas siguen reconociéndose', () => {
    // Quedaron escritas en 45 filas históricas. Si dejaran de reconocerse, el registro avisaría
    // «sección desconocida» sobre cada lunes y cada miércoles anterior a la unificación.
    expect(FALABELLA_GRAFIAS_VIEJAS).toEqual(['Fala full', 'falabella full']);
    for (const vieja of FALABELLA_GRAFIAS_VIEJAS) expect(SECCIONES_A_MANO).toContain(vieja);
  });

  it('la grafía nueva también está entre las que no se llenan a mano', () => {
    expect(SECCIONES_A_MANO).toContain(FALABELLA_EN_HOJA);
  });

  it('el jueves ya no lleva: se cortó el 08/10/2026', () => {
    expect(filaFalabella(JUEVES)).toBe(null);
  });

  it('martes, viernes, sábado y domingo tampoco', () => {
    expect(filaFalabella(MARTES)).toBe(null);
    expect(filaFalabella('2026-11-06')).toBe(null);   // viernes
    expect(filaFalabella('2026-11-07')).toBe(null);   // sábado
    expect(filaFalabella('2026-11-08')).toBe(null);   // domingo
  });

  it('una fecha que no se entiende no inventa una fila', () => {
    expect(filaFalabella('hoy')).toBe(null);
    expect(filaFalabella('')).toBe(null);
    expect(filaFalabella('2026-02-30')).toBe(null);
  });
});

describe('filasEsqueleto: la fila de Falabella Full', () => {
  it('el lunes se crea, al cierre y sin tienda', () => {
    const f = filasEsqueleto(['57CAS'], [], LUNES);
    expect(f[f.length - 1]).toEqual({ tienda: '', seccion: 'FALABELLA FULL' });
  });

  it('el miércoles se crea igual: ya no hay «la otra grafía»', () => {
    const f = filasEsqueleto(['57CAS'], [], MIERCOLES);
    expect(f[f.length - 1]).toEqual({ tienda: '', seccion: 'FALABELLA FULL' });
  });

  it('el lunes y el miércoles escriben exactamente el mismo texto', () => {
    const lun = filasEsqueleto(['57CAS'], [], LUNES).at(-1)?.seccion;
    const mie = filasEsqueleto(['57CAS'], [], MIERCOLES).at(-1)?.seccion;
    expect(lun).toBe(mie);
  });

  it('es UNA sola, no una por tienda', () => {
    const cods = Array.from({ length: 30 }, (_, i) => `T${i}`);
    expect(filasEsqueleto(cods, [], LUNES).filter(x => /fala/i.test(x.seccion))).toHaveLength(1);
  });

  it('no lleva tienda, porque es del día entero', () => {
    const f = filasEsqueleto(['57CAS', '28TEM'], [], MIERCOLES);
    expect(f.find(x => /fala/i.test(x.seccion))?.tienda).toBe('');
  });

  it('el martes el bloque queda exactamente como antes, sin fila de más', () => {
    const cods = ['57CAS', '28TEM'];
    expect(filasEsqueleto(cods, [], MARTES)).toHaveLength(2 * 3 + 1 + 2);
    expect(filasEsqueleto(cods, [], LUNES)).toHaveLength(2 * 3 + 1 + 2 + 1);
  });

  it('los dos bloques reales de esta semana dan el tamaño que miden en la hoja', () => {
    // Lunes 09/11: 30 tiendas × 3 + 2 chocolates + 2 congelados + 1 Falabella = 95, que es
    // exactamente el bloque 36214-36308. Miércoles 04/11: 21 × 3 + 2 + 2 + 1 = 68, el bloque
    // 35967-36034.
    const dos = [mov({ picker: 'Diego Farr' }), mov({ picker: 'Valentina Conejera' })];
    const tiendas = (n: number) => Array.from({ length: n }, (_, i) => `T${String(i).padStart(2, '0')}`);
    expect(filasEsqueleto(tiendas(30), dos, LUNES)).toHaveLength(95);
    expect(filasEsqueleto(tiendas(21), dos, '2026-11-04')).toHaveLength(68);
  });

  it('una fecha ilegible no rompe el bloque: se arma sin ella', () => {
    const f = filasEsqueleto(['57CAS'], [], 'no-es-fecha');
    expect(f).toHaveLength(3 + 1 + 2);
    expect(f.some(x => /fala/i.test(x.seccion))).toBe(false);
  });
});

describe('SECCIONES_A_MANO', () => {
  it('lleva congelados y las dos grafías de Falabella', () => {
    expect(SECCIONES_A_MANO).toContain('CONGELADOS');
    expect(SECCIONES_A_MANO).toContain('Fala full');
    expect(SECCIONES_A_MANO).toContain('falabella full');
  });

  it('cubre TODO lo que el esqueleto crea y el registro no llena', () => {
    // Este es el test que importa de verdad: si mañana se agrega una fila al esqueleto y se
    // olvida esta lista, `registroOlas` la trataría de sección desconocida y sacaría un aviso
    // falso en cada registro. Antes del 10/11/2026 eso pasaba todos los lunes.
    const norm = (x: string) =>
      x.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
    const aMano = new Set(SECCIONES_A_MANO.map(norm));
    const seLlenan = new Set(['COMIDA', 'ASEO', 'HOGAR', 'CHOCOLATES']);
    for (const dia of [LUNES, MARTES, MIERCOLES, JUEVES, '2026-11-06', '2026-11-07']) {
      for (const f of filasEsqueleto(['57CAS'], [mov()], dia)) {
        const s = norm(f.seccion);
        expect(seLlenan.has(s) || aMano.has(s)).toBe(true);
      }
    }
  });
});
