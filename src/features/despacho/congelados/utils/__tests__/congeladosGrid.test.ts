import { describe, it, expect } from 'vitest';
import { gruposDeZona, perteneceAZona, tiendasGrillaCongelados } from '../congeladosGrid';

describe('gruposDeZona', () => {
  it("nacional → solo 'fal'", () => {
    expect(gruposDeZona('nacional')).toEqual(['fal']);
  });

  it("rmcosta → 'rm' y 'costa'", () => {
    expect(gruposDeZona('rmcosta')).toEqual(['rm', 'costa']);
  });
});

describe('perteneceAZona', () => {
  // '39PSB' (La Serena) está en el catálogo de Regiones (TIENDAS/SENDU_EXTRAS).
  it('tienda de Regiones pertenece a la zona nacional', () => {
    expect(perteneceAZona('39PSB', 'nacional')).toBe(true);
  });

  it('tienda de Regiones NO pertenece a la zona rmcosta', () => {
    expect(perteneceAZona('39PSB', 'rmcosta')).toBe(false);
  });

  // '23PEÑ' (Peñalolén, RM) y '37VIÑ' (Viña del Mar, Costa/VR) están en TIENDAS_SANTIAGO.
  it('tienda RM pertenece a la zona rmcosta', () => {
    expect(perteneceAZona('23PEÑ', 'rmcosta')).toBe(true);
  });

  it('tienda Costa (VR) pertenece a la zona rmcosta', () => {
    expect(perteneceAZona('37VIÑ', 'rmcosta')).toBe(true);
  });

  it('tienda RM/Costa NO pertenece a la zona nacional', () => {
    expect(perteneceAZona('23PEÑ', 'nacional')).toBe(false);
  });

  it('código desconocido no pertenece a ninguna zona', () => {
    expect(perteneceAZona('99XXX', 'nacional')).toBe(false);
    expect(perteneceAZona('99XXX', 'rmcosta')).toBe(false);
  });
});

describe('tiendasGrillaCongelados', () => {
  const siempreTrue = () => true;
  const siempreFalse = () => false;

  it('une calendario + picking, dedupe preservando orden (calendario primero)', () => {
    const result = tiendasGrillaCongelados(['A', 'B'], ['B', 'C'], siempreTrue);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  it('excluye tiendas de picking que no pertenecen a la zona', () => {
    const result = tiendasGrillaCongelados(['A'], ['B', 'C'], siempreFalse);
    expect(result).toEqual(['A']);
  });

  it('solo picking (sin calendario) filtra por zona', () => {
    const result = tiendasGrillaCongelados([], ['B', 'C'], (cod) => cod === 'C');
    expect(result).toEqual(['C']);
  });

  it('ignora códigos vacíos en ambas listas', () => {
    const result = tiendasGrillaCongelados(['A', ''], ['', 'C'], siempreTrue);
    expect(result).toEqual(['A', 'C']);
  });

  it('listas vacías devuelven []', () => {
    expect(tiendasGrillaCongelados([], [], siempreTrue)).toEqual([]);
  });

  it('sin picking data, devuelve solo el calendario deduplicado', () => {
    const result = tiendasGrillaCongelados(['A', 'A', 'B'], [], siempreTrue);
    expect(result).toEqual(['A', 'B']);
  });
});
