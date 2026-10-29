import { describe, it, expect } from 'vitest';
import { AYUDAS_BODEGA } from '../ayudaBodega';

describe('los «?» de Bodega', () => {
  const temas = Object.entries(AYUDAS_BODEGA);

  it('cada uno tiene título y entre 2 y 4 líneas', () => {
    for (const [, a] of temas) {
      expect(a.titulo.length).toBeGreaterThan(0);
      expect(a.lineas.length).toBeGreaterThanOrEqual(2);
      expect(a.lineas.length).toBeLessThanOrEqual(4);
    }
  });

  it('ninguna línea pasa de 130 letras: se leen en el teléfono', () => {
    for (const [tema, a] of temas) {
      for (const l of a.lineas) expect(l.length, `${tema}: ${l}`).toBeLessThanOrEqual(130);
    }
  });

  it('explica las abreviaturas que se ven en la tarjeta', () => {
    const tipo = AYUDAS_BODEGA.tipoCarga.lineas.join(' ');
    for (const ab of ['Com', 'Hog', 'Ase', 'Cho', '⋯']) expect(tipo).toContain(ab);
  });

  it('juntar nombra los dos efectos con las mismas palabras de los botones', () => {
    const j = AYUDAS_BODEGA.juntar.lineas.join(' ');
    expect(j).toContain('«Queda dentro»');
    expect(j).toContain('«Quedan como uno»');
  });
});
