import { describe, it, expect } from 'vitest';
import { esFantasmaCalT } from '../calTFantasma';

describe('esFantasmaCalT', () => {
  it('fantasma: fuera del catálogo y sin cantidades', () => {
    expect(esFantasmaCalT({ p: 0, b: 0, ch: 0 }, false)).toBe(true);
    expect(esFantasmaCalT({}, false)).toBe(true);
  });

  it('NO fantasma: tienda del catálogo (aunque no tenga cantidades aún)', () => {
    // Ej. tienda del calendario cuyas cantidades todavía no llegan → debe mostrarse.
    expect(esFantasmaCalT({ p: 0, b: 0 }, true)).toBe(false);
  });

  it('NO fantasma: fuera del catálogo PERO con cantidades (manual legítimo)', () => {
    expect(esFantasmaCalT({ p: 3, b: 0 }, false)).toBe(false);
    expect(esFantasmaCalT({ p: 0, b: 2 }, false)).toBe(false);
    expect(esFantasmaCalT({ p: 0, b: 0, ch: 1 }, false)).toBe(false);
  });

  it('sin datos → se oculta', () => {
    expect(esFantasmaCalT(undefined, false)).toBe(true);
  });
});
