import { describe, it, expect } from 'vitest';
import { esCambioDeUnidad } from '../unidadVisual';

describe('esCambioDeUnidad', () => {
  it('pasar de P1 a B1 es un cambio: la tarjeta anima', () => {
    expect(esCambioDeUnidad('fila-p1', 'fila-b1')).toBe(true);
  });
  it('la misma unidad que se vuelve a dibujar no anima', () => {
    expect(esCambioDeUnidad('fila-p1', 'fila-p1')).toBe(false);
  });
  it('al abrir la tienda no hay anterior: no anima', () => {
    expect(esCambioDeUnidad(null, 'fila-p1')).toBe(false);
    expect(esCambioDeUnidad(undefined, 'fila-p1')).toBe(false);
    expect(esCambioDeUnidad('', 'fila-p1')).toBe(false);
  });
});
