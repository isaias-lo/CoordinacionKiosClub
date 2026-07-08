import { describe, it, expect } from 'vitest';
import { validarDimensiones, LIMITES } from '../data/tiendas';

describe('validarDimensiones — límite de altura de pallet en bodega (185 cm)', () => {
  it('LIMITES.pallet.altoMax es 185 cm', () => {
    expect(LIMITES.pallet.altoMax).toBe(185);
  });

  it('no reporta error para un pallet de 185 cm o menos', () => {
    expect(validarDimensiones('pallet', 500, 185, 100, 120)).toEqual([]);
    expect(validarDimensiones('pallet', 500, 150, 100, 120)).toEqual([]);
  });

  it('reporta error de alto máximo al superar 185 cm en pallet', () => {
    const errores = validarDimensiones('pallet', 500, 190, 100, 120);
    expect(errores).toContain('Alto máximo 185 cm');
  });

  it('no afecta el límite de altura de box (200 cm), que se mantiene sin cambios', () => {
    expect(validarDimensiones('box', 400, 190, 200, 200)).toEqual([]);
    expect(validarDimensiones('box', 400, 210, 200, 200)).toContain('Alto máximo 200 cm');
  });
});
