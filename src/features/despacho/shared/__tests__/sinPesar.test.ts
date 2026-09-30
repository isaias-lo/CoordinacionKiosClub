import { describe, it, expect } from 'vitest';
import { esSinPesar } from '../sinPesar';
import {
  TIPO_ADQUISICION, TIPO_WEB_RETIRO, PKG_ADQUISICION, PKG_WEB_RETIRO,
  LABEL_ADQUISICION, LABEL_WEB_RETIRO,
} from '../adquisicion';

describe('esSinPesar — detección de items agregados sin pesar', () => {
  it('true cuando peso es 0', () => {
    expect(esSinPesar({ peso: 0 })).toBe(true);
  });

  it('true cuando peso es undefined', () => {
    expect(esSinPesar({ peso: undefined })).toBe(true);
  });

  it('true cuando peso es null', () => {
    expect(esSinPesar({ peso: null })).toBe(true);
  });

  it('true cuando peso es negativo', () => {
    expect(esSinPesar({ peso: -5 })).toBe(true);
  });

  it('false cuando peso es 20', () => {
    expect(esSinPesar({ peso: 20 })).toBe(false);
  });

  it('false cuando peso es 100', () => {
    expect(esSinPesar({ peso: 100 })).toBe(false);
  });
});

describe('los AGREGADOS no esperan que nadie los pese', () => {
  it('una adquisición con peso 0 NO está "sin pesar"', () => {
    // No se pesan: nacen completos y apretar el botón es todo (`naceCompleta`). Contarlos dejaba
    // la alerta puesta en la tarjeta de la tienda para siempre, pidiendo un peso que no iba a
    // llegar — y el aviso dejaba de distinguir "falta pesar esto" de "esto no se pesa".
    expect(esSinPesar({ peso: 0, tipo: TIPO_ADQUISICION })).toBe(false);
    expect(esSinPesar({ peso: 0, tipo: TIPO_WEB_RETIRO })).toBe(false);
  });

  it('vale en los DOS espejos, que llaman distinto a lo mismo', () => {
    // En RM/Costa `tipo` es el envase; en Nacional `tipo` es el CONTENIDO y el envase va en `pkg`.
    // Mirar un solo campo dejaba el arreglo puesto en un espejo y roto en el otro.
    expect(esSinPesar({ peso: 0, pkg: PKG_ADQUISICION })).toBe(false);
    expect(esSinPesar({ peso: 0, pkg: PKG_WEB_RETIRO })).toBe(false);
    // Nacional manda el contenido en `tipo` y el envase en `pkg`, los dos a la vez.
    expect(esSinPesar({ peso: 0, tipo: 'comida', pkg: PKG_ADQUISICION })).toBe(false);
  });

  it('también reconoce la escritura de la planilla', () => {
    // Una fila releída desde Sheets trae la etiqueta con tilde y espacios, no el valor interno.
    expect(esSinPesar({ peso: 0, tipo: LABEL_ADQUISICION })).toBe(false);
    expect(esSinPesar({ peso: 0, tipo: LABEL_WEB_RETIRO })).toBe(false);
  });

  it('el resto de los envases sigue igual: un pallet en 0 SÍ está sin pesar', () => {
    // El modo de falla que hay que evitar al arreglar esto: tapar la alerta para todo el mundo.
    expect(esSinPesar({ peso: 0, tipo: 'Pallet' })).toBe(true);
    expect(esSinPesar({ peso: 0, tipo: 'Bulto' })).toBe(true);
    expect(esSinPesar({ peso: 0, tipo: 'Chocolate' })).toBe(true);
    expect(esSinPesar({ peso: 0, pkg: 'pallet' })).toBe(true);
    expect(esSinPesar({ peso: 0, tipo: 'comida', pkg: 'box' })).toBe(true);
  });

  it('un agregado al que alguien SÍ le puso peso tampoco está sin pesar', () => {
    expect(esSinPesar({ peso: 12, tipo: TIPO_ADQUISICION })).toBe(false);
  });
});
