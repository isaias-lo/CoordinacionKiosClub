import { describe, it, expect } from 'vitest';
import { SECTORES, zonaDeSector, zonaDeSectorOGeo, esSectorCanonico, opcionesSector } from '../sectores';

describe('zonaDeSector', () => {
  it('mapea los sectores canónicos a su zona', () => {
    expect(zonaDeSector('Costa')).toBe('costa');
    expect(zonaDeSector('Región Sur')).toBe('sur');
    expect(zonaDeSector('Región Norte')).toBe('norte');
    for (const s of ['Corredor Oriente', 'Corredor Sur', 'Corredor Providencia'])
      expect(zonaDeSector(s)).toBe('santiago');
  });
  it('tolera mayúsculas, acentos y espacios', () => {
    expect(zonaDeSector('  COSTA ')).toBe('costa');
    expect(zonaDeSector('  REGIÓN SUR ')).toBe('sur');
    expect(zonaDeSector('region norte')).toBe('norte');
  });
  it('"Región" a secas no alcanza: hace falta la latitud', () => {
    expect(zonaDeSector('Región')).toBeNull();
    expect(zonaDeSector('Region')).toBeNull();
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
  it('el corredor Sur de Santiago NO se confunde con Región Sur', () => {
    expect(zonaDeSector('Corredor Sur')).toBe('santiago');
  });
  it('NO confunde "V Región" con Santiago', () => {
    // empieza con V, no con "regi" → hoy rutearía como Santiago. Queda documentado a propósito:
    // el desplegable existe justamente para que este valor no se pueda escribir.
    expect(zonaDeSector('V Región')).toBe('santiago');
  });
});

// Las 17 fichas cargadas antes de la separación dicen 'Región' a secas. El CD está en
// −33,41 y ninguna tienda de Regiones queda cerca: La Serena −29,9 al norte, Machalí
// −34,2 al sur. La latitud las separa sin ambigüedad.
describe('zonaDeSectorOGeo', () => {
  const CD = -33.412581;
  it('separa por latitud cuando el sector no distingue', () => {
    expect(zonaDeSectorOGeo('Región', -42.48, CD)).toBe('sur');    // Castro
    expect(zonaDeSectorOGeo('Región', -23.57, CD)).toBe('norte');  // Antofagasta
    expect(zonaDeSectorOGeo('Región', -34.18, CD)).toBe('sur');    // Machalí, la más cercana
    expect(zonaDeSectorOGeo('Región', -29.93, CD)).toBe('norte');  // La Serena
  });
  it('el sector explícito le gana a la latitud', () => {
    expect(zonaDeSectorOGeo('Región Norte', -42.48, CD)).toBe('norte');
    expect(zonaDeSectorOGeo('Región Sur', -23.57, CD)).toBe('sur');
  });
  it('sin GPS asume sur, que es lo más común', () => {
    expect(zonaDeSectorOGeo('Región', null, CD)).toBe('sur');
    expect(zonaDeSectorOGeo('Región', undefined, CD)).toBe('sur');
  });
  it('no toca lo que no es Región', () => {
    expect(zonaDeSectorOGeo('Costa', -42, CD)).toBe('costa');
    expect(zonaDeSectorOGeo('Corredor Sur', -42, CD)).toBe('santiago');
    expect(zonaDeSectorOGeo('', -42, CD)).toBeNull();
  });
});

describe('esSectorCanonico', () => {
  it('reconoce los siete de la lista', () => {
    for (const o of SECTORES) expect(esSectorCanonico(o.valor)).toBe(true);
  });
  it('acepta también "Región" a secas, que quedó de antes', () => {
    expect(esSectorCanonico('Región')).toBe(true);
  });
  it('rechaza lo que no está', () => {
    for (const s of ['Las Condes', 'costa', '', 'Costas']) expect(esSectorCanonico(s)).toBe(false);
  });
});

describe('opcionesSector', () => {
  it('con un valor canónico devuelve solo la lista', () => {
    expect(opcionesSector('Costa')).toHaveLength(SECTORES.length);
  });
  it('"Región" a secas se muestra al final, para invitar a precisar sur o norte', () => {
    const o = opcionesSector('Región');
    expect(o).toHaveLength(SECTORES.length + 1);
    expect(o.at(-1)!.valor).toBe('Región');
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
