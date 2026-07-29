import { describe, it, expect } from 'vitest';
import { GRUPO_SUR_SET, GRUPO_NORTE_SET } from '../routing';

// Documenta y fija los grupos de ruteo curados SUR/NORTE que asignar() usa para agrupar
// tiendas en rutas dedicadas. Antes estaban inline dentro de la función; ahora exportados.
// Este test atrapa una edición accidental de la curación (no cambia comportamiento).
describe('grupos de ruteo SUR/NORTE', () => {
  it('GRUPO_SUR_SET tiene los códigos curados', () => {
    expect([...GRUPO_SUR_SET].sort()).toEqual(['CFL', 'FLO', 'PEN', 'PTA', 'SMB']);
  });

  it('GRUPO_NORTE_SET tiene los códigos curados', () => {
    expect([...GRUPO_NORTE_SET].sort()).toEqual(['EST', 'LP', 'PIE', 'PQA', 'TPS', 'TRQ']);
  });

  it('son conjuntos disjuntos (una tienda no está en ambos)', () => {
    const inter = [...GRUPO_SUR_SET].filter(c => GRUPO_NORTE_SET.has(c));
    expect(inter).toEqual([]);
  });
});
