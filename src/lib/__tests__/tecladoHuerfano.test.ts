import { describe, it, expect } from 'vitest';
import { abreTeclado, tecladoHuerfano } from '../tecladoHuerfano';

const usable = { conectado: true, deshabilitado: false, visible: true };

describe('tecladoHuerfano', () => {
  it('sin campo recordado no hay nada que cerrar', () => {
    expect(tecladoHuerfano(null, 'ninguno')).toBe(false);
  });
  it('el campo se borró con el cursor adentro (se guardó la tarjeta)', () => {
    expect(tecladoHuerfano({ ...usable, conectado: false, visible: false }, 'ninguno')).toBe(true);
  });
  it('la tienda quedó terminada y el fieldset apagó el campo', () => {
    expect(tecladoHuerfano({ ...usable, deshabilitado: true }, 'mismo')).toBe(true);
  });
  it('el campo se ocultó (la hoja del teléfono se cerró)', () => {
    expect(tecladoHuerfano({ ...usable, visible: false }, 'ninguno')).toBe(true);
  });
  it('el cursor pasó a otro campo: el teclado sigue siendo útil', () => {
    expect(tecladoHuerfano({ ...usable, conectado: false }, 'otro-campo')).toBe(false);
  });
  it('el campo sigue usable: no se toca', () => {
    expect(tecladoHuerfano(usable, 'mismo')).toBe(false);
    expect(tecladoHuerfano(usable, 'ninguno')).toBe(false);
  });
});

describe('abreTeclado', () => {
  it('campos de texto y número, sí', () => {
    expect(abreTeclado({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(abreTeclado({ tagName: 'input', type: 'number' })).toBe(true);
    expect(abreTeclado({ tagName: 'TEXTAREA' })).toBe(true);
    expect(abreTeclado({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('casillas, botones, solo lectura y nada, no', () => {
    expect(abreTeclado({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(abreTeclado({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false);
    expect(abreTeclado({ tagName: 'BUTTON' })).toBe(false);
    expect(abreTeclado(null)).toBe(false);
  });
});
