import { describe, it, expect } from 'vitest';
import {
  pesoVolumetrico, normalizarMedidas, hayMedidas, DIVISOR_VOLUMETRICO,
} from '../medidasPallet';

describe('pesoVolumetrico', () => {
  it('usa el divisor de transporte terrestre y redondea a un decimal', () => {
    // Chocolate oficial: 42 × 80 × 56 = 188.160 cm³ / 6000 = 31,36 → 31,4
    expect(pesoVolumetrico(42, 80, 56)).toBe(31.4);
    expect(DIVISOR_VOLUMETRICO).toBe(6000);
  });

  it('falta una medida ⇒ null, NO 0', () => {
    // Devolver 0 haría creer que el bulto no ocupa lugar; null dice "no se sabe".
    expect(pesoVolumetrico(42, 80, null)).toBeNull();
    expect(pesoVolumetrico(42, null, 56)).toBeNull();
    expect(pesoVolumetrico(null, 80, 56)).toBeNull();
    expect(pesoVolumetrico()).toBeNull();
  });

  it('un cero o un negativo cuentan como ausentes', () => {
    expect(pesoVolumetrico(0, 80, 56)).toBeNull();
    expect(pesoVolumetrico(-42, 80, 56)).toBeNull();
  });

  it('acepta lo que llega de un input de texto', () => {
    expect(pesoVolumetrico('42', '80', '56')).toBe(31.4);
    expect(pesoVolumetrico('abc', '80', '56')).toBeNull();
    expect(pesoVolumetrico('', '', '')).toBeNull();
  });
});

describe('normalizarMedidas', () => {
  it('convierte los strings del formulario a lo que acepta la base', () => {
    expect(normalizarMedidas({ peso_kg: '18.5', alto: '42', largo: '80', ancho: '56' }))
      .toEqual({ peso_kg: 18.5, alto: 42, largo: 80, ancho: 56, peso_v: 31.4 });
  });

  it('acepta coma decimal — un teclado en español escribe 18,5', () => {
    expect(normalizarMedidas({ peso_kg: '18,5' }).peso_kg).toBe(18.5);
  });

  it('las medidas se redondean a entero: las columnas de la base son integer', () => {
    const m = normalizarMedidas({ alto: '42.6', largo: '80.2', ancho: '56' });
    expect(m.alto).toBe(43);
    expect(m.largo).toBe(80);
  });

  it('vacío no es cero: un campo sin llenar queda null', () => {
    expect(normalizarMedidas({ peso_kg: '', alto: '', largo: '', ancho: '' }))
      .toEqual({ peso_kg: null, alto: null, largo: null, ancho: null, peso_v: null });
  });

  it('un 0 escrito a mano tampoco es un peso', () => {
    // 0 kg significa "sin pesar", no "pesa cero" — misma lectura que sinPesar.ts.
    expect(normalizarMedidas({ peso_kg: 0 }).peso_kg).toBeNull();
    expect(normalizarMedidas({ peso_kg: '0' }).peso_kg).toBeNull();
  });

  it('deriva peso_v aunque no haya peso: es geometría, no pesaje', () => {
    const m = normalizarMedidas({ alto: 42, largo: 80, ancho: 56 });
    expect(m.peso_kg).toBeNull();
    expect(m.peso_v).toBe(31.4);
  });

  it('no inventa peso_v con las medidas incompletas', () => {
    expect(normalizarMedidas({ peso_kg: 18, alto: 42 }).peso_v).toBeNull();
  });
});

describe('hayMedidas', () => {
  it('todo vacío ⇒ false, para no mandar un PATCH sin nada que cambiar', () => {
    expect(hayMedidas(normalizarMedidas({}))).toBe(false);
    expect(hayMedidas(normalizarMedidas({ peso_kg: '', alto: '' }))).toBe(false);
  });

  it('con solo el peso ya vale la pena', () => {
    expect(hayMedidas(normalizarMedidas({ peso_kg: 18 }))).toBe(true);
  });

  it('con solo las medidas también', () => {
    expect(hayMedidas(normalizarMedidas({ alto: 42, largo: 80, ancho: 56 }))).toBe(true);
  });
});
