import { describe, it, expect } from 'vitest';
import { bannerReapertura, botonReapertura, toastSuma } from '../reaperturaAltura';

describe('bannerReapertura', () => {
  it('al sumar pide confirmar la altura', () => {
    expect(bannerReapertura('suma')).toContain('confirma la altura');
  });

  it('al unificar mantiene el texto de siempre', () => {
    expect(bannerReapertura('union')).toBe('⬦ Unificado · peso ya sumado — ingresa la altura y Agregar');
  });
});

describe('botonReapertura', () => {
  it('distingue sumado de unificado', () => {
    expect(botonReapertura('suma')).toBe('+ Agregar (sumado)');
    expect(botonReapertura('union')).toBe('+ Agregar (unificado)');
  });
});

describe('toastSuma', () => {
  it('una unidad', () => {
    expect(toastSuma('P1', 24)).toBe('Sumado a P1 (+24kg) — confirma la altura y Agregar');
  });

  it('varias unidades', () => {
    expect(toastSuma('P1', 183, 10)).toBe('10 sumados a P1 (+183kg) — confirma la altura y Agregar');
  });

  it('51SER: los 10 ítems que dejaron el pallet en 345 kg con la altura vieja', () => {
    expect(toastSuma('P2', 183, 10)).toContain('+183kg');
  });
});
