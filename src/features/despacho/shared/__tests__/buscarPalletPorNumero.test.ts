import { describe, it, expect } from 'vitest';
import { buscarPalletPorNumero, type SlotConId } from '../buscarPalletPorNumero';

type Slot = SlotConId & { tipo: string };

describe('buscarPalletPorNumero', () => {
  const slotsPorTienda: Record<string, Slot[]> = {
    '51SER': [{ id: 12718, tipo: 'P' }, { id: 12719, tipo: 'B' }],
    '01TPS': [{ id: 9001, tipo: 'P' }],
  };

  it('encuentra el pallet y dice en qué tienda está', () => {
    const out = buscarPalletPorNumero(slotsPorTienda, '12718');
    expect(out).toEqual({ claveTienda: '51SER', slot: { id: 12718, tipo: 'P' } });
  });

  it('encuentra un pallet en otra tienda distinta a la primera', () => {
    const out = buscarPalletPorNumero(slotsPorTienda, '9001');
    expect(out?.claveTienda).toBe('01TPS');
  });

  it('tolera espacios alrededor del número', () => {
    expect(buscarPalletPorNumero(slotsPorTienda, '  12718  ')?.claveTienda).toBe('51SER');
  });

  it('devuelve null si el número no existe en ninguna tienda', () => {
    expect(buscarPalletPorNumero(slotsPorTienda, '99999')).toBeNull();
  });

  it('devuelve null para texto que no es puramente numérico (código de tienda, por ejemplo)', () => {
    expect(buscarPalletPorNumero(slotsPorTienda, '51SER')).toBeNull();
    expect(buscarPalletPorNumero(slotsPorTienda, '127a8')).toBeNull();
  });

  it('devuelve null para una búsqueda vacía', () => {
    expect(buscarPalletPorNumero(slotsPorTienda, '')).toBeNull();
    expect(buscarPalletPorNumero(slotsPorTienda, '   ')).toBeNull();
  });

  it('funciona con el mapa vacío', () => {
    expect(buscarPalletPorNumero({}, '12718')).toBeNull();
  });
});
