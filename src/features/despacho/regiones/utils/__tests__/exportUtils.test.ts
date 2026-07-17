import { describe, it, expect } from 'vitest';
import { buildRows } from '../exportUtils';
import type { DispatchItem } from '@/types';

const item: DispatchItem = {
  orden: 'pallet1', tipo: 'comida', pkg: 'pallet',
  guia: '167420', valor: 5000, peso: 100, alto: 150, ancho: 100, largo: 120,
};

describe('buildRows — dirección de exportación', () => {
  it('Puerto Montt exporta calle "Illapel Calle" y número "10"', () => {
    const rows = buildRows({ 'Puerto Montt': [item] });
    expect(rows).toHaveLength(1);
    // Columnas del template "Carga tus pedidos": 12 = calle, 13 = numero.
    expect(rows[0][12]).toBe('Illapel Calle');
    expect(rows[0][13]).toBe('10');
  });
});
