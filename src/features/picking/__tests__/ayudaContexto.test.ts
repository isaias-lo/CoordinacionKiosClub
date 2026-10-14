import { describe, it, expect } from 'vitest';
import { AYUDITAS, textoFranja, claveFranjaCerrada, posicionBurbuja } from '../marco/ayudaContexto';

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

describe('la burbuja del «?» cabe en la pantalla', () => {
  const pantalla = { ancho: 1440, alto: 860 };
  const burbuja = { ancho: 300, alto: 140 };
  const boton = (left: number, top: number) => ({ left, top, right: left + 18, bottom: top + 18 });

  it('con espacio, queda debajo del botón', () => {
    const p = posicionBurbuja(boton(400, 200), pantalla, burbuja);
    expect(p).toMatchObject({ x: 390, y: 226, arriba: false });
  });

  it('EL CASO del Batch: pegado al borde derecho, se corre hacia adentro y no se corta', () => {
    const p = posicionBurbuja(boton(1390, 300), pantalla, burbuja);
    expect(p.x + burbuja.ancho).toBeLessThanOrEqual(pantalla.ancho - 12);
    // La flecha sigue apuntando al «?».
    expect(p.x + p.flecha + 6).toBeCloseTo(1399, 0);
  });

  it('al borde izquierdo no se sale', () => {
    expect(posicionBurbuja(boton(2, 200), pantalla, burbuja).x).toBe(12);
  });

  it('abajo de la pantalla, se abre hacia arriba', () => {
    const p = posicionBurbuja(boton(400, 800), pantalla, burbuja);
    expect(p.arriba).toBe(true);
    expect(p.y + burbuja.alto).toBeLessThanOrEqual(800);
  });

  it('pantalla más angosta que la burbuja: pegada al margen, sin valores negativos', () => {
    const p = posicionBurbuja(boton(100, 100), { ancho: 280, alto: 600 }, burbuja);
    expect(p.x).toBe(12);
    expect(p.flecha).toBeGreaterThanOrEqual(10);
  });
});
