import { describe, it, expect } from 'vitest';
import { safeStorageKey } from '../storageKey';

describe('safeStorageKey', () => {
  it('convierte la Ñ del código de tienda a N (caso 23PEÑ / Peñalolén)', () => {
    expect(safeStorageKey('recep_23PEÑ_1785_1.jpg')).toBe('recep_23PEN_1785_1.jpg');
    expect(safeStorageKey('1785_23PEÑ-30-07-2026_ORIGINAL.pdf')).toBe('1785_23PEN-30-07-2026_ORIGINAL.pdf');
  });

  it('quita acentos (Maipú→Maipu, Ñuñoa→Nunoa)', () => {
    expect(safeStorageKey('Maipú')).toBe('Maipu');
    expect(safeStorageKey('Ñuñoa')).toBe('Nunoa');
    expect(safeStorageKey('Concón')).toBe('Concon');
  });

  it('deja intactas las claves ya ASCII y las rutas con carpeta', () => {
    expect(safeStorageKey('recep_18FLO_1785_1.jpg')).toBe('recep_18FLO_1785_1.jpg');
    expect(safeStorageKey('pallets/26ALC_1.jpg')).toBe('pallets/26ALC_1.jpg');
  });

  it('reemplaza espacios y símbolos raros por _', () => {
    expect(safeStorageKey('foto rara (1).jpg')).toBe('foto_rara__1_.jpg');
    expect(safeStorageKey('')).toBe('');
  });

  it('el resultado nunca contiene caracteres no-ASCII', () => {
    const out = safeStorageKey('23PEÑ_ áéíóú_Ñ.jpg');
    expect(/^[A-Za-z0-9._/-]*$/.test(out)).toBe(true);
  });
});
