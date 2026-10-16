import { describe, it, expect } from 'vitest';
import { franjaDeCaja, palabraDeCaja, enKg } from '../cajaEnLaTarjeta';
import { etiquetaSubtipo, taraDeCaja } from '../subtipoCaja';

// La franja es la mitad que se reconoce SIN leer. La otra mitad —la palabra— sale de
// `etiquetaSubtipo`, que ya tiene sus tests.

describe('franjaDeCaja', () => {
  it('cada caja con su color, y los dos de distinta LUMINOSIDAD', () => {
    expect(franjaDeCaja('negra')).toContain('border-l-caja-negra');
    expect(franjaDeCaja('carton')).toContain('border-l-caja-carton-borde');
  });

  it('las dos llevan el mismo grosor: lo que cambia es el color, no el peso visual', () => {
    expect(franjaDeCaja('negra')).toContain('border-l-[6px]');
    expect(franjaDeCaja('carton')).toContain('border-l-[6px]');
  });

  it('sin caja no hay franja: un pallet o un bulto no la llevan', () => {
    expect(franjaDeCaja(null)).toBe('');
    expect(franjaDeCaja(undefined)).toBe('');
  });

  it('no usa los colores de la LISTA de tiendas, donde una franja significa otra cosa', () => {
    // Ahí azul = la que estás trabajando, verde = lista, celeste = tiene guía.
    for (const caja of ['negra', 'carton'] as const) {
      const f = franjaDeCaja(caja);
      expect(f).not.toContain('navy');
      expect(f).not.toContain('est-ok');
      expect(f).not.toContain('sky');
    }
  });
});

describe('lo que dice la píldora', () => {
  it('solo la palabra que distingue: «Caja» se repite en las dos', () => {
    expect(palabraDeCaja('negra')).toBe('Negra');
    expect(palabraDeCaja('carton')).toBe('Cartón');
    expect(etiquetaSubtipo('carton')).toBe('Caja Cartón');   // el nombre largo no se toca
  });

  it('el número se escribe como en Chile', () => {
    expect(enKg(3.3)).toBe('3,3');
    expect(enKg(0.4)).toBe('0,4');
  });

  it('la tara que muestra es la real de cada caja', () => {
    expect(taraDeCaja('negra')).toBe(3.3);
    expect(taraDeCaja('carton')).toBe(0.4);
  });
});
