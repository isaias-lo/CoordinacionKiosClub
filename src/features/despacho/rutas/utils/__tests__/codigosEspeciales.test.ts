import { describe, it, expect } from 'vitest';
import { fluyeSinCalendario } from '../codigosEspeciales';

describe('fluyeSinCalendario', () => {
  it('OFIKC (oficina) fluye sin calendario', () => {
    expect(fluyeSinCalendario('OFIKC')).toBe(true);
  });
  it('las tiendas normales NO (el calendario manda)', () => {
    expect(fluyeSinCalendario('26ALC')).toBe(false);
    expect(fluyeSinCalendario('49PTA')).toBe(false);
    expect(fluyeSinCalendario('')).toBe(false);
  });
});
