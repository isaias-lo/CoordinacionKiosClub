import { describe, it, expect } from 'vitest';
import {
  grupoCalendario, tipoVisual, buscarTiendas, fueraDeGrupo, moverASuGrupo,
  fusionarCalendario, mismoCalendario, type CalGrupos, type FichaCal,
} from '../grupoCalendario';

// Fichas reales del catálogo del 20/10/2026.
const RIO: FichaCal = { n: 'Espacio Rio', z: 'Región Sur', tipo: 'STRIPCENTER', d: '' };
const PBL: FichaCal = { n: 'Los Pablos', z: 'Región Sur', tipo: 'MALL', d: '' };
const CAS: FichaCal = { n: 'Castro', z: 'Región', tipo: 'MALL', d: '' };
const ANA: FichaCal = { n: 'Antofagasta Angamos', z: 'Región Norte', tipo: 'MALL', d: '' };
const CON: FichaCal = { n: 'Concón', z: 'Costa', tipo: 'STRIPCENTER', d: '' };
const LGN: FichaCal = { n: 'Lagunas', z: 'Corredor Oriente', tipo: 'MALL', d: '' };

describe('grupoCalendario', () => {
  // El bug: «Región Sur» con tipo STRIPCENTER caía en RM.
  it('«Región Sur» y «Región Norte» van a REGIONES aunque tengan tipo', () => {
    expect(grupoCalendario(RIO)).toBe('fal');
    expect(grupoCalendario(PBL)).toBe('fal');
    expect(grupoCalendario(ANA)).toBe('fal');
  });
  it('«Región» a secas, Costa y los corredores', () => {
    expect(grupoCalendario(CAS)).toBe('fal');
    expect(grupoCalendario(CON)).toBe('costa');
    expect(grupoCalendario({ ...CON, z: 'Costa Valparaíso' })).toBe('costa');
    expect(grupoCalendario(LGN)).toBe('rm');
  });
  it('sin sector cae a la heurística vieja', () => {
    expect(grupoCalendario({ z: '', tipo: 'region' })).toBe('fal');
    expect(grupoCalendario({ z: '', tipo: '', d: 'Av. X 123' })).toBe('rm');
    expect(grupoCalendario(undefined)).toBe('rm');
  });
});

describe('tipoVisual', () => {
  it('Regiones se pinta como región, no como su tipo', () => {
    expect(tipoVisual(RIO)).toBe('region');
    expect(tipoVisual(CON)).toBe('costa');
    expect(tipoVisual(LGN)).toBe('mall');
    expect(tipoVisual({ z: 'Corredor Sur', tipo: 'STRIPCENTER' })).toBe('strip');
  });
});

describe('buscarTiendas', () => {
  const T = { '61RIO': RIO, '60PBL': PBL, '22LGN': LGN, '33CON': CON };
  it('61RIO aparece buscando en REGIONES', () => {
    expect(buscarTiendas(T, '61rio', 'fal')).toEqual([{ cod: '61RIO', grupo: 'fal' }]);
  });
  it('en RM también aparece, pero marcada como de REGIONES', () => {
    expect(buscarTiendas(T, 'rio', 'rm')).toEqual([{ cod: '61RIO', grupo: 'fal' }]);
  });
  it('primero las de la pestaña abierta', () => {
    const r = buscarTiendas(T, 'a', 'rm').map(s => s.cod);
    expect(r[0]).toBe('22LGN');
  });
  it('vacío no busca y respeta el límite', () => {
    expect(buscarTiendas(T, '  ', 'rm')).toEqual([]);
    expect(buscarTiendas(T, '', 'rm', 1)).toHaveLength(0);
    expect(buscarTiendas(T, 'l', 'rm', 2)).toHaveLength(2);
  });
  it('busca por nombre', () => {
    expect(buscarTiendas(T, 'espacio', 'fal').map(s => s.cod)).toEqual(['61RIO']);
  });
});

describe('fueraDeGrupo y moverASuGrupo', () => {
  const grupoDe = (c: string) => ({ '61RIO': 'fal', '22LGN': 'rm' } as const)[c as '61RIO'] ?? null;
  const cal: CalGrupos = { LU: { rm: ['22LGN', '61RIO'], costa: [], fal: ['57CAS'] } };
  it('detecta la tienda guardada en la pestaña equivocada', () => {
    expect(fueraDeGrupo(cal, grupoDe)).toEqual([{ cod: '61RIO', dia: 'LU', esta: 'rm', va: 'fal' }]);
  });
  it('no opina de lo que no conoce', () => {
    expect(fueraDeGrupo({ LU: { rm: ['99XXX'], costa: [], fal: [] } }, grupoDe)).toEqual([]);
  });
  it('la mueve al final de su pestaña, el mismo día, sin tocar el original', () => {
    const m = moverASuGrupo(cal, fueraDeGrupo(cal, grupoDe));
    expect(m.LU).toEqual({ rm: ['22LGN'], costa: [], fal: ['57CAS', '61RIO'] });
    expect(cal.LU.rm).toEqual(['22LGN', '61RIO']);
  });
});

describe('fusionarCalendario', () => {
  const c = (rm: string[], fal: string[] = []): CalGrupos => ({ LU: { rm, costa: [], fal } });

  it('sin cambios del otro, queda lo mío', () => {
    expect(fusionarCalendario(c(['A', 'B']), c(['B', 'A', 'C']), c(['A', 'B']))).toEqual(c(['B', 'A', 'C']));
  });
  it('lo que el otro agregó no se pierde', () => {
    expect(fusionarCalendario(c(['A']), c(['A', 'B']), c(['A'], ['61RIO']))).toEqual(c(['A', 'B'], ['61RIO']));
    expect(fusionarCalendario(c(['A']), c(['A', 'B']), c(['A', 'X']))).toEqual(c(['A', 'B', 'X']));
  });
  it('lo que el otro quitó no vuelve', () => {
    expect(fusionarCalendario(c(['A', 'B']), c(['A', 'B', 'C']), c(['A']))).toEqual(c(['A', 'C']));
  });
  it('lo que yo quité no vuelve', () => {
    expect(fusionarCalendario(c(['A', 'B']), c(['A']), c(['A', 'B', 'X']))).toEqual(c(['A', 'X']));
  });
  it('si los dos agregan la misma, queda una', () => {
    expect(fusionarCalendario(c([]), c(['A']), c(['A']))).toEqual(c(['A']));
  });
  it('días que solo tiene el otro', () => {
    const r = fusionarCalendario({}, {}, { MA: { rm: ['A'], costa: [], fal: [] } });
    expect(r.MA.rm).toEqual(['A']);
  });
});

describe('mismoCalendario', () => {
  it('compara contenido y orden, no claves', () => {
    expect(mismoCalendario({ LU: { rm: ['A'], costa: [], fal: [] } }, { LU: { fal: [], costa: [], rm: ['A'] } })).toBe(true);
    expect(mismoCalendario({ LU: { rm: ['A', 'B'], costa: [], fal: [] } }, { LU: { rm: ['B', 'A'], costa: [], fal: [] } })).toBe(false);
    expect(mismoCalendario({ LU: { rm: [], costa: [], fal: [] } }, {})).toBe(true);
    expect(mismoCalendario(null, null)).toBe(true);
    expect(mismoCalendario(null, {})).toBe(false);
  });
});
