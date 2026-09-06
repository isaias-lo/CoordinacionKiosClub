import { describe, it, expect } from 'vitest';
import { fluyeSinCalendario, seAbastecePorCalendario } from '../codigosEspeciales';

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

describe('seAbastecePorCalendario', () => {
  it('las tiendas de verdad se abastecen por calendario', () => {
    for (const t of ['MALL', 'STRIPCENTER', 'TIENDA', '', null, undefined])
      expect(seAbastecePorCalendario(t as string)).toBe(true);
  });

  // La oficina y los puntos logísticos (proveedor de cajas, distribuidor de congelados,
  // proveedor que no entrega congelados) existen para poder rutearlos desde el Planificador.
  // Nadie les programa carga: exigirles calendario sería un aviso permanente y falso.
  it('la oficina y los puntos logísticos no', () => {
    expect(seAbastecePorCalendario('oficina')).toBe(false);
    expect(seAbastecePorCalendario('punto')).toBe(false);
  });

  it('no depende de mayúsculas ni espacios', () => {
    expect(seAbastecePorCalendario('  PUNTO ')).toBe(false);
  });
});
