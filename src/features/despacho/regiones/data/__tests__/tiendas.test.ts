import { describe, it, expect } from 'vitest';
import { isRegionesCod, REGIONES_CODS } from '../tiendas';
import { TIENDAS_SANTIAGO } from '../../../santiago/data/tiendasSantiago';

describe('isRegionesCod', () => {
  it('reconoce tiendas de Regiones', () => {
    expect(isRegionesCod('39PSB')).toBe(true); // La Serena
    expect(isRegionesCod('41ANA')).toBe(true); // Antofagasta
    expect(isRegionesCod('42ANP')).toBe(true); // Antofagasta
    expect(isRegionesCod('76PAN')).toBe(true); // Panguipulli
  });

  it('NO marca como Regiones una tienda de Santiago', () => {
    expect(isRegionesCod('49PTA')).toBe(false); // Los Toros (Puente Alto)
    expect(isRegionesCod('55ITA')).toBe(false); // Barrio Italia
  });

  it('separación limpia: ningún cod de Santiago está en REGIONES_CODS', () => {
    const solapados = TIENDAS_SANTIAGO
      .map(t => t.cod)
      .filter(cod => REGIONES_CODS.has(cod));
    expect(solapados).toEqual([]);
  });
});
