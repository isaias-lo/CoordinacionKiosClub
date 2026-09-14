import { describe, it, expect } from 'vitest';
import { fechaLargaCL, fechaCortaCL, conMayusculaInicial } from '../fechaTexto';

describe('fechaLargaCL', () => {
  it('escribe la fecha como se escribe en español', () => {
    // 11-sep-2026 15:00 UTC = mediodía en Chile.
    expect(fechaLargaCL(new Date('2026-09-11T15:00:00Z'))).toBe('viernes 11 de septiembre de 2026');
  });

  it('no lleva coma antes del año', () => {
    expect(fechaLargaCL(new Date('2026-09-11T15:00:00Z'))).not.toContain(',');
  });

  it('va en minúscula: la decide quien la muestra', () => {
    expect(fechaLargaCL(new Date('2026-09-11T15:00:00Z'))[0]).toBe('v');
  });

  it('usa el día del CD, no el UTC', () => {
    // 12-sep 00:30 UTC = 11-sep 21:30 en Chile.
    expect(fechaLargaCL(new Date('2026-09-12T00:30:00Z'))).toContain('11 de septiembre');
  });

  it('una fecha inválida no rompe la pantalla', () => {
    expect(fechaLargaCL('no es fecha')).toBe('');
  });
});

describe('conMayusculaInicial', () => {
  it('solo la primera letra — el `capitalize` de CSS las ponía en cada palabra', () => {
    expect(conMayusculaInicial('viernes 11 de septiembre de 2026')).toBe('Viernes 11 de septiembre de 2026');
  });

  it('el vacío no rompe', () => {
    expect(conMayusculaInicial('')).toBe('');
  });
});

describe('fechaCortaCL', () => {
  it('sin año: para cabeceras que hablan de hoy', () => {
    expect(fechaCortaCL('2026-09-12T12:00:00')).toBe('sábado 12 de septiembre');
  });

  it('sin la coma que mete es-CL tras el día de la semana', () => {
    expect(fechaCortaCL('2026-09-14T12:00:00')).not.toContain(',');
  });

  it('en minúscula: quien la muestre decide si capitaliza', () => {
    expect(conMayusculaInicial(fechaCortaCL('2026-09-12T12:00:00'))).toBe('Sábado 12 de septiembre');
  });

  it('el caso del bug: "De Septiembre" no vuelve a aparecer', () => {
    const txt = conMayusculaInicial(fechaCortaCL('2026-09-12T12:00:00'));
    expect(txt).not.toContain('De ');
    expect(txt).toContain(' de ');
  });

  it('una fecha inválida devuelve vacío en vez de "Invalid Date"', () => {
    expect(fechaCortaCL('no-es-fecha')).toBe('');
  });

  it('usa la hora de Chile, no la del equipo', () => {
    // 2026-09-13T02:00Z son las 23:00 del sábado 12 en Chile.
    expect(fechaCortaCL('2026-09-13T02:00:00Z')).toBe('sábado 12 de septiembre');
  });
});
