import { describe, it, expect } from 'vitest';
import { pideSeccion, seccionYContenidoManual, normalizarBatch } from '../encargadoManual';

describe('pideSeccion', () => {
  it('en "Todas" hay que preguntar la sección — no hay ninguna activa de dónde deducirla', () => {
    expect(pideSeccion('all')).toBe(true);
  });

  it('dentro de una sección NO se pregunta: ya se sabe cuál es', () => {
    expect(pideSeccion('chocolates')).toBe(false);
    expect(pideSeccion('congelados')).toBe(false);
    expect(pideSeccion('hogar')).toBe(false);
    expect(pideSeccion('aseo-comida')).toBe(false);
  });

  it('en la pestaña Congelados nunca se pregunta, aunque el chip sea "Todas"', () => {
    // Ahí el único chip es "Todas", y preguntar ofrecía las secciones de SECO: el encargado
    // terminaba creado en Seco, con un pallet.
    expect(pideSeccion('all', true)).toBe(false);
  });
});

describe('seccionYContenidoManual', () => {
  it('"Todas" nace SIN sección y con contenido mixto', () => {
    // Regresión: 'all' cayendo en 'hogar' hacía que seccionDeSlot lo clasificara como Hogar
    // en vez de dejarlo sin clasificar. 'mixto' no matchea ninguna sección a propósito.
    expect(seccionYContenidoManual('all')).toEqual({ seccion: null, contenido: 'mixto' });
  });

  it('chocolates y congelados llevan su propio contenido', () => {
    expect(seccionYContenidoManual('chocolates')).toEqual({ seccion: 'chocolates', contenido: 'chocolate' });
    expect(seccionYContenidoManual('congelados')).toEqual({ seccion: 'congelados', contenido: 'congelados' });
  });

  it('hogar y aseo-comida comparten contenido "hogar", pero la sección los distingue', () => {
    // `contenido` es solo el fallback de clasificación; `seccionDeSlot` prefiere `section`,
    // que acá sí viene explícita y distinta. Se fija el comportamiento actual tal cual.
    expect(seccionYContenidoManual('hogar')).toEqual({ seccion: 'hogar', contenido: 'hogar' });
    expect(seccionYContenidoManual('aseo-comida')).toEqual({ seccion: 'aseo-comida', contenido: 'hogar' });
  });

  it('la sección devuelta nunca es la cadena "all"', () => {
    // 'all' no es una Seccion: si se colara, seccionDeSlot la trataría como sección real.
    expect(seccionYContenidoManual('all').seccion).not.toBe('all');
  });
});

describe('seccionYContenidoManual · la primera unidad manda cuando no es ambigua', () => {
  it('un chocolate es de Chocolates aunque se haya elegido "Todas"', () => {
    expect(seccionYContenidoManual('all', 'CH')).toEqual({ seccion: 'chocolates', contenido: 'chocolate' });
  });

  it('una caja de cartón o negra es de Congelados', () => {
    expect(seccionYContenidoManual('all', 'CC')).toEqual({ seccion: 'congelados', contenido: 'congelados' });
    expect(seccionYContenidoManual('congelados', 'CN')).toEqual({ seccion: 'congelados', contenido: 'congelados' });
  });

  it('pallet, bulto o contenedor no deciden: manda la sección elegida', () => {
    expect(seccionYContenidoManual('hogar', 'B')).toEqual({ seccion: 'hogar', contenido: 'hogar' });
    expect(seccionYContenidoManual('all', 'P')).toEqual({ seccion: null, contenido: 'mixto' });
  });
});

describe('normalizarBatch', () => {
  it('se queda solo con los dígitos', () => {
    expect(normalizarBatch('BATCH/123')).toBe('123');
    expect(normalizarBatch(' 45 ')).toBe('45');
    expect(normalizarBatch('12-34')).toBe('1234');
  });

  it('sin dígitos devuelve cadena vacía — no undefined ni null', () => {
    // El vacío es "sin batch"; devolver undefined obligaría a chequear en cada punto de uso.
    expect(normalizarBatch('abc')).toBe('');
    expect(normalizarBatch('')).toBe('');
    expect(normalizarBatch(undefined)).toBe('');
    expect(normalizarBatch(null)).toBe('');
  });

  it('no recorta ceros a la izquierda: el batch es una etiqueta, no un número', () => {
    expect(normalizarBatch('007')).toBe('007');
  });
});
