import { describe, it, expect } from 'vitest';
import { formatRut } from '../rut';

describe('formatRut', () => {
  it('agrega puntos de millar y guión', () => {
    expect(formatRut('123456789')).toBe('12.345.678-9');
  });

  it('no agrega puntos si el número no los necesita (3 dígitos o menos)', () => {
    expect(formatRut('1239')).toBe('123-9');
  });

  it('acepta K como dígito verificador (mayúscula o minúscula)', () => {
    expect(formatRut('12345678k')).toBe('12.345.678-K');
    expect(formatRut('12345678K')).toBe('12.345.678-K');
  });

  it('descarta caracteres que no sean dígitos o K', () => {
    expect(formatRut('12.345.678-9')).toBe('12.345.678-9');
    expect(formatRut('abc123def456ghi78-9')).toBe('12.345.678-9');
  });

  it('corta en 9 caracteres útiles (8 dígitos + dv)', () => {
    expect(formatRut('1234567899999')).toBe('12.345.678-9');
  });

  it('con menos de 2 caracteres devuelve tal cual (sin guión)', () => {
    expect(formatRut('')).toBe('');
    expect(formatRut('1')).toBe('1');
  });
});
