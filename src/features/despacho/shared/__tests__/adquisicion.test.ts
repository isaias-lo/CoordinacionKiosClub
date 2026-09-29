import { describe, it, expect } from 'vitest';
import {
  esAdquisicion, esWebRetiro, esAgregado, pideMedidas, naceCompleta, etiquetaAgregado,
  TIPO_ADQUISICION, TIPO_WEB_RETIRO, PKG_ADQUISICION, PKG_WEB_RETIRO,
  LABEL_ADQUISICION, LABEL_WEB_RETIRO,
} from '../adquisicion';
import { claseSantiago, claseNacional } from '../numeroCard';

describe('reconocer los dos agregados en todas sus escrituras', () => {
  it('la adquisición: RM/Costa, Nacional y la planilla', () => {
    // Si alguna no se reconociera, esa fila se trataría como bulto normal y volvería a pedir
    // medidas — justo lo que este módulo viene a evitar.
    for (const v of [TIPO_ADQUISICION, PKG_ADQUISICION, LABEL_ADQUISICION, '  ADQUISICIÓN  ']) {
      expect(esAdquisicion(v)).toBe(true);
      expect(esAgregado(v)).toBe(true);
    }
  });

  it('el web / retiro, incluida la etiqueta con barra y espacios', () => {
    for (const v of [TIPO_WEB_RETIRO, PKG_WEB_RETIRO, LABEL_WEB_RETIRO, 'Web/Retiro', 'WEB RETIRO']) {
      expect(esWebRetiro(v)).toBe(true);
      expect(esAgregado(v)).toBe(true);
    }
  });

  it('no se confunden entre sí', () => {
    expect(esWebRetiro(TIPO_ADQUISICION)).toBe(false);
    expect(esAdquisicion(TIPO_WEB_RETIRO)).toBe(false);
  });

  it('no confunde los cuatro envases de siempre', () => {
    for (const t of ['Pallet', 'Bulto', 'Contenedor', 'Chocolate', 'pallet', 'box', 'chocolate']) {
      expect(esAgregado(t)).toBe(false);
    }
  });

  it('sin dato no es un agregado', () => {
    for (const v of [undefined, null, '']) expect(esAgregado(v)).toBe(false);
  });
});

describe('pideMedidas', () => {
  it('los dos agregados no piden nada; el resto sí', () => {
    expect(pideMedidas(TIPO_ADQUISICION)).toBe(false);
    expect(pideMedidas(TIPO_WEB_RETIRO)).toBe(false);
    expect(pideMedidas(PKG_WEB_RETIRO)).toBe(false);
    for (const t of ['Bulto', 'Pallet', 'Chocolate', 'Contenedor']) expect(pideMedidas(t)).toBe(true);
  });
});

describe('naceCompleta', () => {
  it('solo los agregados', () => {
    // El modo de falla que evita: sin esto, el aviso de "sin pesar" los cuenta como pendientes
    // para siempre, porque su peso nunca va a llegar.
    expect(naceCompleta(TIPO_ADQUISICION)).toBe(true);
    expect(naceCompleta(TIPO_WEB_RETIRO)).toBe(true);
    expect(naceCompleta('Bulto')).toBe(false);
  });
});

describe('etiquetaAgregado — lo que se escribe en la columna TIPO', () => {
  it('devuelve la etiqueta de cada uno', () => {
    expect(etiquetaAgregado(TIPO_ADQUISICION)).toBe(LABEL_ADQUISICION);
    expect(etiquetaAgregado(PKG_WEB_RETIRO)).toBe(LABEL_WEB_RETIRO);
  });

  it('devuelve null para lo que no es agregado, para que el llamador use el tipo tal cual', () => {
    expect(etiquetaAgregado('Bulto')).toBeNull();
    expect(etiquetaAgregado(undefined)).toBeNull();
  });

  it('ida y vuelta: la etiqueta de la planilla se vuelve a reconocer', () => {
    // La planilla se puede releer, y lo que salió como 'Adquisición' tiene que volver a entrar
    // como adquisición. Sin esto, una fila releída pediría medidas.
    expect(esAdquisicion(etiquetaAgregado(TIPO_ADQUISICION)!)).toBe(true);
    expect(esWebRetiro(etiquetaAgregado(TIPO_WEB_RETIRO)!)).toBe(true);
  });
});

describe('se comportan como BULTO donde se cuenta y se numera', () => {
  it('en los dos espejos caen en la clase bulto', () => {
    // Esto NO es casualidad: `claseSantiago` y `claseNacional` caen por defecto en 'bulto', así que
    // los agregados suman como bulto y se numeran en la misma serie sin tocar esas funciones. El
    // test lo fija: si alguien cambiara ese `return 'bulto'` final, acá se entera.
    expect(claseSantiago(TIPO_ADQUISICION)).toBe('bulto');
    expect(claseSantiago(TIPO_WEB_RETIRO)).toBe('bulto');
    expect(claseNacional(PKG_ADQUISICION)).toBe('bulto');
    expect(claseNacional(PKG_WEB_RETIRO)).toBe('bulto');
  });
});
