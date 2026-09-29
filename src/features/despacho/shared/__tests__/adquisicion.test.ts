import { describe, it, expect } from 'vitest';
import {
  esAdquisicion, esWebRetiro, esAgregado, pideMedidas, naceCompleta, etiquetaAgregado,
  TIPO_ADQUISICION, TIPO_WEB_RETIRO, PKG_ADQUISICION, PKG_WEB_RETIRO,
  LABEL_ADQUISICION, LABEL_WEB_RETIRO, etiquetaDeUnidad,
} from '../adquisicion';
import { claseSantiago, claseNacional, etiquetaCard, ordenDeItem, renumerarOrden } from '../numeroCard';

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

describe('etiquetaDeUnidad — para no escribir "0kg · 0cm" en la tarjeta', () => {
  it('reconoce el agregado en los dos espejos', () => {
    // RM/Costa guarda el envase en `tipo`; Nacional guarda el CONTENIDO en `tipo` y el envase en
    // `pkg`. Mirar un solo campo dejaba el arreglo puesto en un espejo y roto en el otro.
    expect(etiquetaDeUnidad({ tipo: TIPO_ADQUISICION })).toBe(LABEL_ADQUISICION);
    expect(etiquetaDeUnidad({ pkg: PKG_WEB_RETIRO })).toBe(LABEL_WEB_RETIRO);
    expect(etiquetaDeUnidad({ tipo: 'comida', pkg: PKG_ADQUISICION })).toBe(LABEL_ADQUISICION);
  });

  it('devuelve null para lo que sí se pesa, para que la tarjeta muestre los kilos', () => {
    expect(etiquetaDeUnidad({ tipo: 'Pallet' })).toBeNull();
    expect(etiquetaDeUnidad({ tipo: 'comida', pkg: 'pallet' })).toBeNull();
    expect(etiquetaDeUnidad({})).toBeNull();
  });
});

describe('cada uno tiene su propia serie: A1 A2 A3 y W1 W2 W3', () => {
  it('en los dos espejos son su propia clase, NO bulto', () => {
    // Nacieron cayendo en el `return 'bulto'` final de estas dos funciones, y un test anterior lo
    // fijaba a propósito. Se cambió el 29/09/2026 porque esa herencia hacía dos daños: en pantalla
    // eran B4 y B5 —indistinguibles de un bulto— y el contador del alta de RM/Costa comparaba
    // `i.tipo === 'Bulto'`, que nunca coincide con 'Adquisicion', así que las tres adquisiciones de
    // una tienda recibían el mismo número y colapsaban en UNA fila de la planilla.
    expect(claseSantiago(TIPO_ADQUISICION)).toBe('adquisicion');
    expect(claseSantiago(TIPO_WEB_RETIRO)).toBe('webretiro');
    expect(claseNacional(PKG_ADQUISICION)).toBe('adquisicion');
    expect(claseNacional(PKG_WEB_RETIRO)).toBe('webretiro');
  });

  it('el bulto de verdad sigue siendo bulto', () => {
    expect(claseSantiago('Bulto')).toBe('bulto');
    expect(claseNacional('box')).toBe('bulto');
  });

  it('la tarjeta dice A y W, no B', () => {
    expect(etiquetaCard(TIPO_ADQUISICION, 1)).toBe('A1');
    expect(etiquetaCard(TIPO_ADQUISICION, 3)).toBe('A3');
    expect(etiquetaCard(TIPO_WEB_RETIRO, 2)).toBe('W2');
    expect(etiquetaCard('Bulto', 2)).toBe('B2');
  });

  it('el `orden` que va al ID también', () => {
    // El ID de la fila es `${orden}${cod}${stamp}${prefijo}`. Con el orden en `3B` y el prefijo en
    // `A`, el ID decía dos cosas distintas sobre la misma unidad.
    expect(ordenDeItem(TIPO_ADQUISICION, 3)).toBe('A3');
    expect(ordenDeItem(TIPO_WEB_RETIRO, 3)).toBe('W3');
    expect(ordenDeItem('Bulto', 3)).toBe('3B');   // el bulto sigue con el número adelante
  });

  it('EL BUG QUE CIERRA: tres adquisiciones son A1, A2 y A3 — no tres veces la misma', () => {
    // Es la razón de todo el cambio. Tres unidades con el mismo `orden` producen el mismo ID, y el
    // ID es lo que decide si una fila se agrega o se pisa: las tres terminaban siendo una.
    const items = [
      { tipo: 'Bulto' }, { tipo: TIPO_ADQUISICION }, { tipo: TIPO_ADQUISICION },
      { tipo: TIPO_ADQUISICION }, { tipo: TIPO_WEB_RETIRO }, { tipo: TIPO_WEB_RETIRO },
    ];
    const ordenes = renumerarOrden(items, () => null).map(i => i.orden);
    expect(ordenes).toEqual(['1B', 'A1', 'A2', 'A3', 'W1', 'W2']);
    expect(new Set(ordenes).size).toBe(ordenes.length);
  });

  it('cada serie cuenta sola: la adquisición no corre al bulto', () => {
    const items = [{ tipo: TIPO_ADQUISICION }, { tipo: 'Bulto' }, { tipo: TIPO_ADQUISICION }];
    expect(renumerarOrden(items, () => null).map(i => i.orden)).toEqual(['A1', '1B', 'A2']);
  });
});
