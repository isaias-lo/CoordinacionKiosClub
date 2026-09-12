import { describe, it, expect } from 'vitest';
import { fechaLargaCL, conMayusculaInicial } from '../fechaTexto';

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
