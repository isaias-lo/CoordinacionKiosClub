import { describe, it, expect } from 'vitest';
import { AYUDITAS, textoFranja, claveFranjaCerrada } from '../marco/ayudaContexto';

describe('franja de la pestaña', () => {
  it('en Aseo dice que sale como Aseo y que el mixto va en Todas (caso 20CTC)', () => {
    const t = textoFranja('aseo')!;
    expect(t).toContain('etiqueta de Aseo');
    expect(t).toContain('Todas');
  });

  it('Comida y Hogar nombran su propia sección', () => {
    expect(textoFranja('comida')).toContain('etiqueta de Comida');
    expect(textoFranja('hogar')).toContain('etiqueta de Hogar');
  });

  it('en Todas explica que ahí se arma el mixto', () => {
    expect(textoFranja('all')).toContain('mixto');
  });

  it('Chocolates avisa que sale como chocolate', () => {
    expect(textoFranja('chocolates')).toContain('chocolate');
  });

  it('Congelados, sin sección o una desconocida: sin franja', () => {
    expect(textoFranja('congelados')).toBeNull();
    expect(textoFranja(undefined)).toBeNull();
    expect(textoFranja('aseo-comida')).toBeNull();
  });
});

describe('cerrar la franja', () => {
  it('vale por día y por sección', () => {
    expect(claveFranjaCerrada('aseo', '2026-10-14')).not.toBe(claveFranjaCerrada('aseo', '2026-10-15'));
    expect(claveFranjaCerrada('aseo', '2026-10-14')).not.toBe(claveFranjaCerrada('hogar', '2026-10-14'));
  });
});

describe('los «?»', () => {
  it('todos tienen título y entre una y tres líneas: es una ayuda corta, no la guía', () => {
    for (const a of Object.values(AYUDITAS)) {
      expect(a.titulo.length).toBeGreaterThan(0);
      expect(a.lineas.length).toBeGreaterThanOrEqual(1);
      expect(a.lineas.length).toBeLessThanOrEqual(3);
    }
  });
});
