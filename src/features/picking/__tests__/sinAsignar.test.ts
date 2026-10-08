import { describe, it, expect } from 'vitest';
import { ocultarSinAsignar } from '../sinAsignar';
import type { PalletSlot } from '../picking-types';

const slot = { id: 1 } as PalletSlot;

describe('ocultarSinAsignar', () => {
  it('oculta «Sin asignar» sin unidades: el aviso de la tienda ya lo explica', () => {
    expect(ocultarSinAsignar({ key: 'Sin asignar' }, [])).toBe(true);
    expect(ocultarSinAsignar({ key: 'Sin asignar' }, undefined)).toBe(true);
  });

  it('la muestra si ya tiene unidades, para poder verlas y quitarlas', () => {
    expect(ocultarSinAsignar({ key: 'Sin asignar' }, [slot])).toBe(false);
  });

  it('nunca oculta a un encargado de verdad', () => {
    expect(ocultarSinAsignar({ key: 'Juan Pérez' }, [])).toBe(false);
  });
});
