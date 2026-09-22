import { describe, it, expect } from 'vitest';
import { avisoSinPesar, TOPE_VISIBLE } from '../avisoSinPesar';

describe('no hay marca cuando no hay nada que avisar', () => {
  it.each([0, -1, -99])('%i no muestra nada', (n) => {
    expect(avisoSinPesar(n)).toBeNull();
  });

  it('un valor no numérico tampoco dibuja', () => {
    expect(avisoSinPesar(NaN)).toBeNull();
    expect(avisoSinPesar(Infinity)).toBeNull();
  });
});

describe('el número que se dibuja', () => {
  it('una unidad', () => {
    expect(avisoSinPesar(1)).toEqual({ texto: '1', titulo: '1 unidad sin pesar' });
  });

  it('varias', () => {
    expect(avisoSinPesar(4)).toEqual({ texto: '4', titulo: '4 unidades sin pesar' });
  });

  it('el tope se dibuja tal cual', () => {
    expect(avisoSinPesar(TOPE_VISIBLE)?.texto).toBe('9');
  });

  it('por encima del tope se abrevia, pero el texto en palabras dice el número real', () => {
    const a = avisoSinPesar(23);
    expect(a?.texto).toBe('9+');              // dos cifras no entran legibles en la esquina
    expect(a?.titulo).toBe('23 unidades sin pesar');
  });
});

describe('casos de borde', () => {
  it('un decimal se trunca', () => {
    expect(avisoSinPesar(2.7)?.texto).toBe('2');
  });

  it('el singular es solo para 1', () => {
    expect(avisoSinPesar(2)?.titulo).toContain('unidades');
    expect(avisoSinPesar(1)?.titulo).toContain('unidad sin');
  });
});
