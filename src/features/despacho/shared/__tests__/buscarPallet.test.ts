import { describe, it, expect } from 'vitest';
import { buscarPallet, type SlotDePallet } from '../buscarPallet';

// Etiquetas reales sacadas de la base el 22/09/2026.
const s = (id: number, canonical_id: string | null = null): SlotDePallet => ({ id, canonical_id });

const BODEGA = {
  '28TEM': [s(14449, '1B28TEM22092026B')],
  '75PUC': [s(14424, '1B75PUC22092026B'), s(14425, '2B75PUC22092026B')],
  '37VIÑ': [s(14197, '1B37VIÑ21092026B')],
  'sinCanon': [s(13938)],                       // todavía no se imprimió: solo número
};

describe('tecleando el número impreso', () => {
  it('lo encuentra y dice en qué tienda está', () => {
    const r = buscarPallet(BODEGA, '14425');
    expect(r).toMatchObject({ claveTienda: '75PUC', via: 'numero' });
    expect(r?.slot.id).toBe(14425);
  });

  it('funciona aunque el slot no tenga código impreso todavía', () => {
    expect(buscarPallet(BODEGA, '13938')?.claveTienda).toBe('sinCanon');
  });

  it('un número que no existe no devuelve nada', () => {
    expect(buscarPallet(BODEGA, '99999')).toBeNull();
  });

  it('un número que no calza NO cae a la búsqueda por código', () => {
    // Un canonical jamás es solo dígitos, así que seguir buscando solo podría dar un falso match.
    expect(buscarPallet(BODEGA, '2209')).toBeNull();
  });
});

describe('escaneando el código de barras', () => {
  it('encuentra por canonical_id', () => {
    const r = buscarPallet(BODEGA, '1B28TEM22092026B');
    expect(r).toMatchObject({ claveTienda: '28TEM', via: 'codigo' });
    expect(r?.slot.id).toBe(14449);
  });

  it('distingue dos etiquetas de la misma tienda', () => {
    expect(buscarPallet(BODEGA, '2B75PUC22092026B')?.slot.id).toBe(14425);
    expect(buscarPallet(BODEGA, '1B75PUC22092026B')?.slot.id).toBe(14424);
  });

  it('un código que no existe no devuelve nada', () => {
    expect(buscarPallet(BODEGA, '9B99XXX01012026B')).toBeNull();
  });
});

describe('la Ñ: el código de barras no la codifica de forma confiable', () => {
  // `sanitizeForBarcode` NO se aplica al canonical_id, así que 23PEÑ y 37VIÑ llevan la Ñ cruda al
  // Code128. Lo que devuelva la pistola puede no ser byte a byte lo guardado.
  it('lo escaneado sin Ñ encuentra lo guardado CON Ñ', () => {
    expect(buscarPallet(BODEGA, '1B37VIN21092026B')?.slot.id).toBe(14197);
  });

  it('y al revés: con Ñ encuentra igual', () => {
    expect(buscarPallet(BODEGA, '1B37VIÑ21092026B')?.slot.id).toBe(14197);
  });

  it('minúsculas y espacios de la pistola no importan', () => {
    expect(buscarPallet(BODEGA, '  1b37vin21092026b \n')?.slot.id).toBe(14197);
  });

  it('pero NO afloja de más: otra tienda sigue sin matchear', () => {
    expect(buscarPallet(BODEGA, '1B37VIL21092026B')).toBeNull();
  });
});

describe('casos de borde', () => {
  it.each(['', '   ', '\n'])('una query vacía (%j) no devuelve nada', (q) => {
    expect(buscarPallet(BODEGA, q)).toBeNull();
  });

  it('una query de puros signos no devuelve nada', () => {
    expect(buscarPallet(BODEGA, '---')).toBeNull();
  });

  it('una bodega vacía no rompe', () => {
    expect(buscarPallet({}, '14425')).toBeNull();
  });

  it('un slot sin canonical no matchea por código', () => {
    expect(buscarPallet({ t: [s(1)] }, 'CUALQUIERA')).toBeNull();
  });
});
