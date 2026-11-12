import { describe, it, expect } from 'vitest';
import { topeDesdeTexto, TOPE_MIN, TOPE_MAX } from '../topeEditable';

describe('topeDesdeTexto', () => {
  it('la casilla vacía es «sin tope», no cero', () => {
    // Es la diferencia que más cuesta: vacío significa que la tienda no muestra ningún aviso.
    expect(topeDesdeTexto('')).toBeNull();
    expect(topeDesdeTexto('   ')).toBeNull();
  });

  it('un número dentro del rango se guarda', () => {
    expect(topeDesdeTexto('3')).toBe(3);
    expect(topeDesdeTexto('5')).toBe(5);
    expect(topeDesdeTexto(' 4 ')).toBe(4);
    expect(topeDesdeTexto(String(TOPE_MIN))).toBe(TOPE_MIN);
    expect(topeDesdeTexto(String(TOPE_MAX))).toBe(TOPE_MAX);
  });

  it('el cero NO se guarda: para «sin tope» se borra la casilla', () => {
    // Un tope de cero dejaría la tienda en ámbar permanente desde el primer pallet.
    expect(topeDesdeTexto('0')).toBeUndefined();
    expect(topeDesdeTexto('00')).toBeUndefined();
  });

  it('fuera de rango no se guarda', () => {
    expect(topeDesdeTexto(String(TOPE_MAX + 1))).toBeUndefined();
    expect(topeDesdeTexto('99')).toBeUndefined();
  });

  it('lo que no es un entero no se guarda', () => {
    for (const malo of ['3,5', '3.5', '-2', 'cuatro', '4 pallets', '1e3', '+3', ' ', '③']) {
      if (malo.trim() === '') continue;
      expect(topeDesdeTexto(malo)).toBeUndefined();
    }
  });

  it('tres dígitos no pasan aunque el número esté en rango', () => {
    // '003' es un tipeo, no un tope. Mejor avisar que guardar un 3 que nadie quiso escribir.
    expect(topeDesdeTexto('003')).toBeUndefined();
  });
});
