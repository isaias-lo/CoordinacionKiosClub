import { describe, it, expect } from 'vitest';
import { fluyeSinCalendario } from '../codigosEspeciales';

describe('fluyeSinCalendario', () => {
  it('OFIKC (oficina) fluye sin calendario por código (respaldo)', () => {
    expect(fluyeSinCalendario('OFIKC')).toBe(true);
  });

  it('fluye por tipo=oficina aunque el CÓDIGO haya cambiado (robusto ante Config)', () => {
    expect(fluyeSinCalendario('OFI', 'oficina')).toBe(true);
    expect(fluyeSinCalendario('KCLUB', 'Oficina')).toBe(true); // case-insensitive
  });

  it('las tiendas normales NO (el calendario manda)', () => {
    expect(fluyeSinCalendario('26ALC')).toBe(false);
    expect(fluyeSinCalendario('49PTA', 'super')).toBe(false);
    expect(fluyeSinCalendario('')).toBe(false);
    expect(fluyeSinCalendario('X', null)).toBe(false);
  });
});
