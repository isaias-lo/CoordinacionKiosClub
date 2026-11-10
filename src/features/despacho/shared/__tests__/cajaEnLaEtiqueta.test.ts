import { describe, it, expect } from 'vitest';
import { cajaDeLaEtiqueta } from '../cajaEnLaEtiqueta';

describe('cajaDeLaEtiqueta', () => {
  it('chocolate: la caja sale del subtipo', () => {
    expect(cajaDeLaEtiqueta('CH', 'negra')).toEqual({ caja: 'negra', texto: 'CAJA NEGRA' });
    expect(cajaDeLaEtiqueta('CH', 'carton')).toEqual({ caja: 'carton', texto: 'CAJA CARTÓN' });
    expect(cajaDeLaEtiqueta('CH', 'Cartón')).toEqual({ caja: 'carton', texto: 'CAJA CARTÓN' });
  });

  it('chocolate sin subtipo (anterior al cambio) se lee como negra', () => {
    expect(cajaDeLaEtiqueta('CH', null)?.caja).toBe('negra');
    expect(cajaDeLaEtiqueta('CH')?.caja).toBe('negra');
  });

  it('congelados: CN es negra y CC es cartón, sin importar el subtipo', () => {
    expect(cajaDeLaEtiqueta('CN')).toEqual({ caja: 'negra', texto: 'CAJA NEGRA' });
    expect(cajaDeLaEtiqueta('CC')).toEqual({ caja: 'carton', texto: 'CAJA CARTÓN' });
    expect(cajaDeLaEtiqueta('cc', 'negra')?.caja).toBe('carton');
  });

  it('lo que no es caja no lleva rótulo', () => {
    for (const t of ['P', 'B', 'C', '', null, undefined, 'X']) {
      expect(cajaDeLaEtiqueta(t, 'carton')).toBeNull();
    }
  });
});
