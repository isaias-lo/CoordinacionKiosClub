import { describe, it, expect } from 'vitest';
import { diaDe, filasCalendario, tiendasDelDia, textoPorGrupo, usaDomingo, type CalRecord } from '../ajustes/calendario';

const cal: CalRecord = {
  LU: { rm: ['18FLO', '23PEÑ'], costa: ['60VIÑ'], fal: [] },
  JU: { rm: ['18FLO'], costa: [], fal: ['31TLC', '46TRE'] },
  VI: { rm: ['48BRU'] },
};

describe('calendario de picking', () => {
  it('lee el día de una fecha, con domingo propio', () => {
    expect(diaDe(new Date(2026, 9, 8))).toBe('JU');
    expect(diaDe(new Date(2026, 9, 11))).toBe('DO');
  });
  it('arma una fila por tienda con sus días', () => {
    const f = filasCalendario(cal, 'rm');
    expect(f.map(x => [x.cod, [...x.dias].join(','), x.veces])).toEqual([
      ['18FLO', 'LU,JU', 2], ['23PEÑ', 'LU', 1], ['48BRU', 'VI', 1],
    ]);
  });
  it('cuenta las tiendas del día por zona', () => {
    const h = tiendasDelDia(cal, 'JU');
    expect(h.codigos).toEqual(['31TLC', '46TRE', '18FLO']);
    expect(textoPorGrupo(h.porGrupo)).toBe('1 Santiago · 2 regiones');
    expect(tiendasDelDia(cal, 'SA').codigos).toEqual([]);
  });
  it('muestra el domingo solo si alguien lo usa', () => {
    expect(usaDomingo(cal)).toBe(false);
    expect(usaDomingo({ ...cal, DO: { rm: [], costa: ['60VIÑ'], fal: [] } })).toBe(true);
  });
});
