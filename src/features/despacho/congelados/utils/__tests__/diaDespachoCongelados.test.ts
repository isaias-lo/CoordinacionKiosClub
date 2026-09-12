import { describe, it, expect } from 'vitest';
import { diaDespachoCongelados, diasHastaDespacho } from '../diaDespachoCongelados';

// Semana de referencia: 2026-09-07 lunes … 2026-09-13 domingo.
describe('diaDespachoCongelados', () => {
  it('de lunes a jueves sale al día siguiente', () => {
    expect(diaDespachoCongelados('2026-09-07')).toBe('2026-09-08'); // lunes → martes
    expect(diaDespachoCongelados('2026-09-08')).toBe('2026-09-09');
    expect(diaDespachoCongelados('2026-09-09')).toBe('2026-09-10');
    expect(diaDespachoCongelados('2026-09-10')).toBe('2026-09-11'); // jueves → viernes
  });

  it('lo del VIERNES sale recién el lunes: la flota interna no trabaja el fin de semana', () => {
    expect(diaDespachoCongelados('2026-09-11')).toBe('2026-09-14');
  });

  it('un armado de fin de semana cae en el lunes', () => {
    expect(diaDespachoCongelados('2026-09-12')).toBe('2026-09-14'); // sábado
    expect(diaDespachoCongelados('2026-09-13')).toBe('2026-09-14'); // domingo
  });

  it('cruza el cambio de mes y el de año', () => {
    expect(diaDespachoCongelados('2026-09-30')).toBe('2026-10-01');
    expect(diaDespachoCongelados('2026-12-31')).toBe('2027-01-01'); // jueves → viernes
  });

  it('una fecha inválida se devuelve tal cual en vez de reventar', () => {
    expect(diaDespachoCongelados('')).toBe('');
    expect(diaDespachoCongelados('no-es-fecha')).toBe('no-es-fecha');
  });
});

describe('diasHastaDespacho', () => {
  it('1 día entre semana, 3 el viernes', () => {
    expect(diasHastaDespacho('2026-09-07')).toBe(1);
    expect(diasHastaDespacho('2026-09-11')).toBe(3);
  });
});
