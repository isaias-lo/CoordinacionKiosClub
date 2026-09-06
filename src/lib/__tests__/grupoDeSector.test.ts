import { describe, it, expect } from 'vitest';
import { grupoDeSector, SECTORES } from '../sectores';

describe('grupoDeSector', () => {
  // Los ocho valores de la lista cerrada tienen que caer en un grupo. Si alguien agrega un
  // sector nuevo y olvida la regla, esto lo dice antes de que una tienda salga en otro camión.
  it('todos los sectores de la lista cerrada tienen grupo', () => {
    for (const s of SECTORES) expect(grupoDeSector(s.valor)).not.toBeNull();
  });

  it('los cinco corredores de Santiago son rm', () => {
    for (const s of SECTORES.filter(x => x.zona === 'santiago'))
      expect(grupoDeSector(s.valor)).toBe('rm');
  });

  it('Costa es costa', () => {
    expect(grupoDeSector('Costa')).toBe('costa');
  });

  // Sur y norte son "Regiones" para armar; solo se separan para saber quién transporta.
  it('Región Sur y Región Norte son fal, igual que "Región" a secas', () => {
    expect(grupoDeSector('Región Sur')).toBe('fal');
    expect(grupoDeSector('Región Norte')).toBe('fal');
    expect(grupoDeSector('Región')).toBe('fal');
  });

  it('las comunas sueltas cargadas de antes caen en rm', () => {
    for (const s of ['Las Condes', 'Ñuñoa', 'Santiago']) expect(grupoDeSector(s)).toBe('rm');
  });

  it('no depende de mayúsculas ni espacios', () => {
    expect(grupoDeSector('  COSTA ')).toBe('costa');
    expect(grupoDeSector('región sur')).toBe('fal');
  });

  it('sin sector no se afirma nada', () => {
    expect(grupoDeSector('')).toBeNull();
    expect(grupoDeSector(null)).toBeNull();
    expect(grupoDeSector(undefined)).toBeNull();
  });

  // Lo que motivó el cambio: 'Valparaíso' es el NOMBRE de la región, no un sector. Si se colara
  // como sector no debe decidir el grupo — para eso está 'Costa'.
  it('un nombre de región no es un sector', () => {
    expect(grupoDeSector('Valparaíso')).toBe('rm');
  });
});
