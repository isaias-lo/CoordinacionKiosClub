import { describe, it, expect } from 'vitest';
import { camposDeSlot, slotTraeDatos } from '../camposDeSlot';

describe('camposDeSlot', () => {
  it('el caso real: el pallet 13047 vuelve con sus 485 kg, no en blanco', () => {
    expect(camposDeSlot({ peso_kg: 485 }).peso).toBe('485');
  });

  it('trae peso y las tres medidas', () => {
    expect(camposDeSlot({ peso_kg: 36, alto: 42, largo: 80, ancho: 56 }))
      .toEqual({ peso: '36', alto: '42', largo: '80', ancho: '56' });
  });

  it('acepta números que vienen como texto (PostgREST manda numeric así)', () => {
    expect(camposDeSlot({ peso_kg: '485', alto: '120' }).peso).toBe('485');
    expect(camposDeSlot({ peso_kg: '485' }).alto).toBe('');
  });

  it('el decimal va con coma, como el resto del formulario', () => {
    expect(camposDeSlot({ peso_kg: 12.5 }).peso).toBe('12,5');
  });

  it('un 0 NO es un dato: va vacío, para que obligue a completarlo', () => {
    // Un "0" parece medido y deja pasar el guardado como si lo estuviera.
    expect(camposDeSlot({ peso_kg: 0, alto: 0, largo: 0, ancho: 0 }))
      .toEqual({ peso: '', alto: '', largo: '', ancho: '' });
  });

  it('null, undefined y vacío tampoco inventan un cero', () => {
    expect(camposDeSlot({ peso_kg: null, alto: undefined, largo: '', ancho: null }))
      .toEqual({ peso: '', alto: '', largo: '', ancho: '' });
    expect(camposDeSlot(null)).toEqual({ peso: '', alto: '', largo: '', ancho: '' });
    expect(camposDeSlot(undefined)).toEqual({ peso: '', alto: '', largo: '', ancho: '' });
  });

  it('un valor negativo o basura se descarta en vez de escribirse', () => {
    expect(camposDeSlot({ peso_kg: -5, alto: 'qué' }).peso).toBe('');
    expect(camposDeSlot({ alto: 'qué' }).alto).toBe('');
  });
});

describe('slotTraeDatos', () => {
  it('distingue un pallet ya pesado de uno que vuelve de verdad vacío', () => {
    expect(slotTraeDatos({ peso_kg: 485 })).toBe(true);
    expect(slotTraeDatos({ alto: 120 })).toBe(true);
    expect(slotTraeDatos({ peso_kg: 0 })).toBe(false);
    expect(slotTraeDatos(null)).toBe(false);
  });
});
