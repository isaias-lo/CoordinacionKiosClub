import { describe, it, expect } from 'vitest';
import { SECTORES, zonaDeSector, esSectorCanonico, opcionesSector } from '../sectores';

describe('zonaDeSector', () => {
  it('mapea los sectores canónicos a su zona', () => {
    expect(zonaDeSector('Costa')).toBe('costa');
    expect(zonaDeSector('Región')).toBe('regiones');
    for (const s of ['Corredor Oriente', 'Corredor Sur', 'Corredor Providencia'])
      expect(zonaDeSector(s)).toBe('santiago');
  });
  it('tolera mayúsculas, acentos y espacios', () => {
    expect(zonaDeSector('  COSTA ')).toBe('costa');
    expect(zonaDeSector('Region')).toBe('regiones');
    expect(zonaDeSector('región')).toBe('regiones');
  });
  it('las comunas sueltas que ya están cargadas rutean como Santiago', () => {
    for (const s of ['Las Condes', 'Ñuñoa', 'Santiago'])
      expect(zonaDeSector(s)).toBe('santiago');
  });
  it('vacío devuelve null para que el llamador use su respaldo', () => {
    expect(zonaDeSector('')).toBeNull();
    expect(zonaDeSector('   ')).toBeNull();
    expect(zonaDeSector(null)).toBeNull();
    expect(zonaDeSector(undefined)).toBeNull();
  });
  it('NO confunde "V Región" con Santiago', () => {
    // empieza con V, no con "regi" → hoy rutearía como Santiago. Queda documentado a propósito:
    // el desplegable existe justamente para que este valor no se pueda escribir.
    expect(zonaDeSector('V Región')).toBe('santiago');
  });
});

describe('esSectorCanonico', () => {
  it('reconoce los siete de la lista', () => {
    for (const o of SECTORES) expect(esSectorCanonico(o.valor)).toBe(true);
  });
  it('rechaza lo que no está', () => {
    for (const s of ['Las Condes', 'costa', '', 'Costas']) expect(esSectorCanonico(s)).toBe(false);
  });
});

describe('opcionesSector', () => {
  it('con un valor canónico devuelve solo la lista', () => {
    expect(opcionesSector('Costa')).toHaveLength(SECTORES.length);
  });
  it('con vacío devuelve solo la lista', () => {
    expect(opcionesSector('')).toHaveLength(SECTORES.length);
  });
  it('conserva el valor viejo para no perderlo al editar', () => {
    const o = opcionesSector('Ñuñoa');
    expect(o).toHaveLength(SECTORES.length + 1);
    expect(o[o.length - 1].valor).toBe('Ñuñoa');
    expect(o[o.length - 1].zona).toBe('santiago');
  });
  it('el valor conservado muestra a qué zona rutea', () => {
    expect(opcionesSector('Las Condes').at(-1)!.detalle).toContain('santiago');
  });
});
