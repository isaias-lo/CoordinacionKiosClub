import { describe, it, expect } from 'vitest';
import {
  CHOCOLATE_BULTO_DIMS, dimsAlCambiarContenido, abreviaturaContenido, nombreContenido,
} from '../contenidoCarga';

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
