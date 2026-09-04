import { describe, it, expect } from 'vitest';
import { serializarBase } from '../syncBase';

describe('serializarBase', () => {
  it('ignora los campos que NO son parte de la base (el bug del corta-ecos)', () => {
    // Lo que se empuja lleva fechaDespacho/registrado/sessionDate/pushedAt; la base es solo el
    // contenido. Antes cada punto serializaba una forma distinta y la comparación nunca coincidía.
    const base   = { dispatch: { A: [1] }, pdfData: {} };
    const push   = { ...base, fechaDespacho: '2026-09-02', registrado: false };
    const remoto = { ...push, sessionDate: '2026-09-02', pushedAt: 123456 };
    expect(serializarBase(push)).toBe(serializarBase(base));
    expect(serializarBase(remoto)).toBe(serializarBase(base));
  });

  it('es estable ante el orden de inserción de las tiendas', () => {
    const a = { dispatch: { '11ILC': [1], '40LIL': [2] }, pdfData: {} };
    const b = { dispatch: { '40LIL': [2], '11ILC': [1] }, pdfData: {} };
    expect(serializarBase(a)).toBe(serializarBase(b));
  });

  it('detecta un cambio real de contenido', () => {
    const a = { dispatch: { A: [1] }, pdfData: {} };
    const b = { dispatch: { A: [1, 2] }, pdfData: {} };
    expect(serializarBase(a)).not.toBe(serializarBase(b));
  });

  it('distingue pdfData aunque dispatch sea igual', () => {
    const a = { dispatch: { A: [1] }, pdfData: {} };
    const b = { dispatch: { A: [1] }, pdfData: { A: { url: 'x' } } };
    expect(serializarBase(a)).not.toBe(serializarBase(b));
  });

  it('tolera null/undefined y objetos vacíos sin romper', () => {
    const vacio = serializarBase({ dispatch: {}, pdfData: {} });
    expect(serializarBase(null)).toBe(vacio);
    expect(serializarBase(undefined)).toBe(vacio);
    expect(serializarBase({})).toBe(vacio);
  });
});
