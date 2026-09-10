import { describe, it, expect } from 'vitest';
import {
  columnasCatalogo, columnasCampos,
  BP_CATALOGO_APILADO, BP_CAMPOS_APILADOS,
} from '../gridPersonal';

describe('columnasCatalogo', () => {
  it('deja los dos catálogos lado a lado en escritorio', () => {
    expect(columnasCatalogo(1440)).toBe('minmax(0,1fr) minmax(0,1fr)');
    expect(columnasCatalogo(1280)).toBe('minmax(0,1fr) minmax(0,1fr)');
  });

  it('mantiene lado a lado la tablet en horizontal, que sí tiene ancho', () => {
    expect(columnasCatalogo(1180)).toBe('minmax(0,1fr) minmax(0,1fr)'); // iPad 10.9" horizontal
  });

  it('apila la tablet en vertical, que es donde no cabían', () => {
    expect(columnasCatalogo(820)).toBe('minmax(0,1fr)');  // iPad vertical
    expect(columnasCatalogo(768)).toBe('minmax(0,1fr)');
  });

  it('el corte es exacto: justo en el breakpoint todavía van lado a lado', () => {
    expect(columnasCatalogo(BP_CATALOGO_APILADO)).toBe('minmax(0,1fr) minmax(0,1fr)');
    expect(columnasCatalogo(BP_CATALOGO_APILADO - 1)).toBe('minmax(0,1fr)');
  });
});

describe('columnasCampos', () => {
  it('le da más ancho al nombre que al teléfono y la empresa', () => {
    expect(columnasCampos(1280)).toBe('minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)');
  });

  it('apila los tres campos en teléfono', () => {
    expect(columnasCampos(390)).toBe('minmax(0,1fr)');
  });

  it('el corte es exacto', () => {
    expect(columnasCampos(BP_CAMPOS_APILADOS)).toBe('minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)');
    expect(columnasCampos(BP_CAMPOS_APILADOS - 1)).toBe('minmax(0,1fr)');
  });
});

describe('ninguna pista puede desbordar su caja', () => {
  // Este es el test que protege el arreglo de fondo. `1fr` (= `minmax(auto,1fr)`) toma como
  // mínimo el min-content del input —~20 caracteres— y por eso la grilla se salía en vez de
  // encoger. Toda pista tiene que declarar mínimo 0.
  const todas = [
    columnasCatalogo(1440), columnasCatalogo(820),
    columnasCampos(1280), columnasCampos(390),
  ];

  it('todas las pistas usan minmax(0,…) y ninguna queda como 1fr pelado', () => {
    for (const cols of todas) {
      for (const pista of cols.split(' ')) {
        expect(pista).toMatch(/^minmax\(0,/);
      }
    }
  });
});
