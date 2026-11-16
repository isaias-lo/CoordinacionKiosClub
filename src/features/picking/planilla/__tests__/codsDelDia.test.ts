import { describe, it, expect } from 'vitest';
import { codsDelDia, diaCalendario, type CalendarioSemanal } from '../codsDelDia';

const CAL: CalendarioSemanal = {
  LU: { fal: ['41ANA', '42ANP'], costa: ['08RNC'], rm: ['17MAI', '14PF'] },
  VI: { fal: ['51SER', '39PSB'], costa: [], rm: ['01TPS', '05LP', '02SCL'] },
  MI: { rm: ['20CTC'] },
};

// Fechas reales: 2026-11-13 es viernes, 2026-11-16 lunes, 2026-11-15 domingo.
const VIERNES = '2026-11-13', LUNES = '2026-11-16', DOMINGO = '2026-11-15';

describe('diaCalendario', () => {
  it('traduce la fecha al código del calendario', () => {
    expect(diaCalendario(VIERNES)).toBe('VI');
    expect(diaCalendario(LUNES)).toBe('LU');
    expect(diaCalendario('2026-11-14')).toBe('SA');
  });

  it('el domingo se pliega al lunes: el calendario no tiene columna de domingo', () => {
    expect(diaCalendario(DOMINGO)).toBe('LU');
  });

  it('una fecha que no se entiende da null en vez de inventar un día', () => {
    expect(diaCalendario('hoy')).toBeNull();
    expect(diaCalendario('')).toBeNull();
    expect(diaCalendario('2026-02-30')).toBeNull();   // rodaría a marzo sin avisar
    expect(diaCalendario('2026-13-01')).toBeNull();
  });
});

describe('codsDelDia: el orden es el de la hoja', () => {
  it('va fal, después costa, después rm', () => {
    expect(codsDelDia(CAL, LUNES)).toEqual(['41ANA', '42ANP', '08RNC', '17MAI', '14PF']);
  });

  it('toma el día de la FECHA, no el de hoy', () => {
    expect(codsDelDia(CAL, VIERNES)).toEqual(['51SER', '39PSB', '01TPS', '05LP', '02SCL']);
  });

  it('un grupo que falta no rompe nada', () => {
    expect(codsDelDia(CAL, '2026-11-11')).toEqual(['20CTC']);   // miércoles, solo rm
  });
});

describe('codsDelDia: las tiendas con carga que el calendario no trae', () => {
  it('se agregan AL FINAL, para no correr a las planificadas', () => {
    // El viernes 13 tuvo 31 tiendas y el calendario trae 27: las de adelanto son reales.
    const movs = [{ cod: '88ML' }, { cod: '05LP' }, { cod: '31TLC' }];
    expect(codsDelDia(CAL, VIERNES, movs)).toEqual(
      ['51SER', '39PSB', '01TPS', '05LP', '02SCL', '31TLC', '88ML']);
  });

  it('las extras van en orden alfabético, no en el que las devolvió Odoo', () => {
    const a = codsDelDia(CAL, VIERNES, [{ cod: '88ML' }, { cod: '31TLC' }]);
    const b = codsDelDia(CAL, VIERNES, [{ cod: '31TLC' }, { cod: '88ML' }]);
    expect(a).toEqual(b);
    expect(a.slice(-2)).toEqual(['31TLC', '88ML']);
  });

  it('no repite una tienda que ya estaba en el calendario', () => {
    const movs = [{ cod: '01TPS' }, { cod: '01TPS' }, { cod: '05LP' }];
    expect(codsDelDia(CAL, VIERNES, movs)).toEqual(['51SER', '39PSB', '01TPS', '05LP', '02SCL']);
  });

  it('normaliza mayúsculas y espacios: «05lp» y «05LP » son la misma', () => {
    expect(codsDelDia(CAL, VIERNES, [{ cod: ' 05lp ' }, { cod: '88ml' }]))
      .toEqual(['51SER', '39PSB', '01TPS', '05LP', '02SCL', '88ML']);
  });

  it('descarta los códigos vacíos', () => {
    expect(codsDelDia(CAL, VIERNES, [{ cod: '' }, { cod: '   ' }]))
      .toEqual(['51SER', '39PSB', '01TPS', '05LP', '02SCL']);
  });
});

describe('codsDelDia: cuando no hay calendario', () => {
  it('sin calendario devuelve las que trabajaron, no una lista vacía', () => {
    // Mejor un bloque con las tiendas que trabajaron que no poder registrar el día.
    expect(codsDelDia(null, VIERNES, [{ cod: '05LP' }, { cod: '01TPS' }]))
      .toEqual(['01TPS', '05LP']);
  });

  it('un día que el calendario no tiene cae en el mismo camino', () => {
    expect(codsDelDia(CAL, '2026-11-14', [{ cod: '05LP' }])).toEqual(['05LP']);   // sábado
  });

  it('sin calendario y sin movimientos, lista vacía y sin romper', () => {
    expect(codsDelDia(null, VIERNES)).toEqual([]);
    expect(codsDelDia(undefined, 'cualquier cosa')).toEqual([]);
  });
});
