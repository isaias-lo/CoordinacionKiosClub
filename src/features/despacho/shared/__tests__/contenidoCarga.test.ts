import { describe, it, expect } from 'vitest';
import {
  CHOCOLATE_BULTO_DIMS, dimsAlCambiarContenido, abreviaturaContenido, nombreContenido, clasificarContenido, contenidoSantiago, contenidoRegiones, CONTENIDO_CHOCOLATE } from '../contenidoCarga';

describe('dimsAlCambiarContenido', () => {
  it('un PALLET de chocolate conserva sus medidas — nunca se le pisan', () => {
    // La regresión que este módulo existe para evitar: al abrir "Chocolate" como tipo de carga
    // del pallet, el autorrelleno le metía las medidas de una CAJA (38×78×52) a un pallet, que
    // mide ~120×100 y llega hasta 185 de alto.
    expect(dimsAlCambiarContenido(true, 'Chocolate', 'Hogar')).toBeNull();
    expect(dimsAlCambiarContenido(true, 'chocolate', 'comida')).toBeNull();
  });

  it('un pallet que DEJA de ser chocolate tampoco se queda sin medidas', () => {
    expect(dimsAlCambiarContenido(true, 'Hogar', 'Chocolate')).toBeNull();
  });

  it('un bulto que pasa a chocolate toma las medidas de la caja', () => {
    expect(dimsAlCambiarContenido(false, 'Chocolate', 'Hogar')).toEqual({
      alto: String(CHOCOLATE_BULTO_DIMS.alto),
      largo: String(CHOCOLATE_BULTO_DIMS.largo),
      ancho: String(CHOCOLATE_BULTO_DIMS.ancho),
    });
  });

  it('un bulto que deja de ser chocolate queda en blanco, para que lo midan de nuevo', () => {
    expect(dimsAlCambiarContenido(false, 'Hogar', 'Chocolate')).toEqual({ alto: '', largo: '', ancho: '' });
  });

  it('entre contenidos que no son chocolate no se toca nada', () => {
    expect(dimsAlCambiarContenido(false, 'Comida', 'Hogar')).toBeNull();
    expect(dimsAlCambiarContenido(false, 'Mixto', 'Comida')).toBeNull();
  });

  it('no distingue mayúsculas: los dos formularios usan vocabularios distintos', () => {
    // Santiago escribe 'Chocolate'; Nacional escribe 'chocolate'.
    expect(dimsAlCambiarContenido(false, 'chocolate', 'hogar')).not.toBeNull();
    expect(dimsAlCambiarContenido(false, 'CHOCOLATE', 'hogar')).not.toBeNull();
  });

  it('devuelve strings, no números — las medidas viven como texto en el formulario', () => {
    const d = dimsAlCambiarContenido(false, 'Chocolate', 'Hogar')!;
    expect(typeof d.alto).toBe('string');
  });
});

describe('etiquetas de contenido', () => {
  it('abrevia a tres letras para los botones', () => {
    expect(abreviaturaContenido('comida')).toBe('Com');
    expect(abreviaturaContenido('hogar')).toBe('Hog');
    expect(abreviaturaContenido('comida-hogar')).toBe('Mix');
    expect(abreviaturaContenido('chocolate')).toBe('Cho');
  });

  it('el nombre completo va en el title, que es lo que se lee al dudar', () => {
    expect(nombreContenido('comida')).toBe('Comida');
    expect(nombreContenido('hogar')).toBe('Hogar');
    expect(nombreContenido('comida-hogar')).toBe('Mixto (comida y hogar)');
    expect(nombreContenido('chocolate')).toBe('Chocolate');
  });
});

describe('el round-trip del chocolate, que estaba roto', () => {
  it('lo que se GUARDA para un chocolate se lee de vuelta como chocolate', () => {
    // El bug: se guardaba 'hogar' y se leía 'hogar'. La columna CARGA decía Hogar.
    expect(clasificarContenido(CONTENIDO_CHOCOLATE)).toBe('chocolate');
    expect(contenidoSantiago(CONTENIDO_CHOCOLATE)).toBe('Chocolate');
    expect(contenidoRegiones(CONTENIDO_CHOCOLATE)).toBe('chocolate');
  });

  it('"hogar" NO puede ser el valor que se escribe para un chocolate', () => {
    expect(clasificarContenido('hogar')).toBe('hogar');
    expect(CONTENIDO_CHOCOLATE).not.toBe('hogar');
  });
});

describe('clasificarContenido', () => {
  it('chocolate gana sobre todo: un "chocolate hogar" es chocolate', () => {
    expect(clasificarContenido('chocolate')).toBe('chocolate');
    expect(clasificarContenido('Chocolate Hogar')).toBe('chocolate');
    expect(clasificarContenido('CHOCOLATES')).toBe('chocolate');
  });

  it('comida y sus sinónimos', () => {
    expect(clasificarContenido('comida')).toBe('comida');
    expect(clasificarContenido('Alimentos')).toBe('comida');
  });

  it('hogar incluye aseo y limpieza', () => {
    for (const v of ['hogar', 'Aseo', 'productos de limpieza']) {
      expect(clasificarContenido(v)).toBe('hogar');
    }
  });

  it('los dos juntos es mixto, escrito como sea', () => {
    expect(clasificarContenido('comida-hogar')).toBe('mixto');
    expect(clasificarContenido('mixto')).toBe('mixto');
    expect(clasificarContenido('comida y hogar')).toBe('mixto');
  });

  it('lo desconocido cae en hogar, que es el default histórico', () => {
    expect(clasificarContenido('cualquier cosa')).toBe('hogar');
    expect(clasificarContenido('')).toBe('hogar');
    expect(clasificarContenido(null)).toBe('hogar');
  });
});

describe('los dos espejos de Bodega clasifican igual con distinto rótulo', () => {
  it('RM/Costa en mayúscula inicial; Nacional en minúscula con "comida-hogar"', () => {
    expect(contenidoSantiago('comida-hogar')).toBe('Mixto');
    expect(contenidoRegiones('mixto')).toBe('comida-hogar');
  });

  it('la diferencia es solo de formato, no de criterio', () => {
    for (const v of ['chocolate', 'comida', 'hogar', 'mixto', 'aseo', '']) {
      expect(contenidoSantiago(v) === 'Chocolate').toBe(contenidoRegiones(v) === 'chocolate');
    }
  });
});
