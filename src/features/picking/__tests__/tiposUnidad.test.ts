import { describe, it, expect } from 'vitest';
import { tiposDeUnidad, primeraUnidadPorDefecto, seccionEfectiva, seccionesDeLaPestana, columnaSeco } from '../tiposUnidad';

describe('seccionEfectiva — el filtro guardado vale solo donde tiene sentido', () => {
  it('en la pestaña Congelados siempre es "Todas": ahí no hay secciones de seco', () => {
    // El filtro se guarda en el navegador y NO se reinicia al cambiar de pestaña. Con "Chocolates"
    // guardado, la pestaña Congelados contaba, imprimía y grababa cajas como si fueran chocolates.
    expect(seccionEfectiva('chocolates', true)).toBe('all');
    expect(seccionEfectiva('hogar', true)).toBe('all');
    expect(seccionEfectiva('all', true)).toBe('all');
  });

  it('en Seco no existe la sección Congelados — tiene su propia pestaña', () => {
    expect(seccionEfectiva('congelados', false)).toBe('all');
  });

  it('en Seco las secciones de seco se respetan', () => {
    expect(seccionEfectiva('chocolates', false)).toBe('chocolates');
    expect(seccionEfectiva('aseo-comida', false)).toBe('aseo-comida');
    expect(seccionEfectiva('all', false)).toBe('all');
  });
});

describe('seccionesDeLaPestana', () => {
  it('Seco ofrece sus cuatro secciones y NO Congelados', () => {
    expect(seccionesDeLaPestana(false)).toEqual(['all', 'aseo-comida', 'hogar', 'chocolates']);
  });

  it('Congelados solo ofrece "Todas"', () => {
    expect(seccionesDeLaPestana(true)).toEqual(['all']);
  });
});

describe('tiposDeUnidad — qué contadores muestra la tarjeta', () => {
  it('Congelados: solo Caja Cartón y Caja Negra', () => {
    expect(tiposDeUnidad(true, 'all')).toEqual(['CC', 'CN']);
  });

  it('Chocolates: solo Pallet y Chocolate', () => {
    expect(tiposDeUnidad(false, 'chocolates')).toEqual(['P', 'CH']);
  });

  it('Aseo y Comida, y Hogar: todo menos Chocolate', () => {
    expect(tiposDeUnidad(false, 'aseo-comida')).toEqual(['P', 'C', 'B']);
    expect(tiposDeUnidad(false, 'hogar')).toEqual(['P', 'C', 'B']);
  });

  it('Todas (seco): los cuatro de seco, nunca las cajas de congelado', () => {
    expect(tiposDeUnidad(false, 'all')).toEqual(['P', 'C', 'B', 'CH']);
  });

  it('una unidad que EXISTE nunca queda invisible, aunque no sea de esa sección', () => {
    // El caso real del 11/09: el encargado manual de Congelados nacía con un Pallet, y la tarjeta
    // de Congelados solo mostraba CC/CN — el pallet existía en la base sin que nadie pudiera verlo
    // ni quitarlo.
    expect(tiposDeUnidad(true, 'all', { P: 1 })).toEqual(['P', 'CC', 'CN']);
    expect(tiposDeUnidad(false, 'chocolates', { B: 2 })).toEqual(['P', 'B', 'CH']);
  });

  it('los contadores en 0 no suman tipos', () => {
    expect(tiposDeUnidad(true, 'all', { P: 0, B: 0 })).toEqual(['CC', 'CN']);
  });

  it('el orden es siempre el mismo, sin importar el orden de los conteos', () => {
    expect(tiposDeUnidad(true, 'all', { CN: 3, P: 1 })).toEqual(['P', 'CC', 'CN']);
  });
});

describe('primeraUnidadPorDefecto — con qué nace un encargado manual', () => {
  // Datos de producción, 30 días: Aseo/Comida 99% P · Hogar 85% P · Chocolates 99% CH.
  it('Congelados nace con Caja Cartón, nunca con Pallet', () => {
    expect(primeraUnidadPorDefecto('congelados')).toBe('CC');
  });

  it('Chocolates nace con Chocolate (99% de lo que se prepara ahí)', () => {
    expect(primeraUnidadPorDefecto('chocolates')).toBe('CH');
  });

  it('el resto nace con Pallet', () => {
    expect(primeraUnidadPorDefecto('aseo-comida')).toBe('P');
    expect(primeraUnidadPorDefecto('hogar')).toBe('P');
    expect(primeraUnidadPorDefecto('all')).toBe('P');
  });

  it('el default siempre es uno de los tipos que esa sección ofrece', () => {
    for (const s of ['all', 'aseo-comida', 'hogar', 'chocolates'] as const) {
      expect(tiposDeUnidad(false, s)).toContain(primeraUnidadPorDefecto(s));
    }
    expect(tiposDeUnidad(true, 'all')).toContain(primeraUnidadPorDefecto('congelados'));
  });
});

describe('columnaSeco — en qué columna de "Todas" cae cada tarjeta', () => {
  it('un encargado de Odoo se ubica por sus categorías, como siempre', () => {
    expect(columnaSeco(['Chocolates'], false)).toBe('chocolates');
    expect(columnaSeco(['Aseo'], false)).toBe('aseo-comida');
    expect(columnaSeco(['Hogar', 'Comida'], false)).toBe('mixto');
    expect(columnaSeco(['Hogar'], false)).toBe('hogar');
  });

  it('un encargado MANUAL se ubica por la sección de sus unidades, no cae siempre en Hogar', () => {
    // Antes la columna salía solo de las operaciones de Odoo; un manual no tiene, así que TODOS
    // terminaban en Hogar — también los de Chocolates.
    expect(columnaSeco(['Chocolates'], true)).toBe('chocolates');
    expect(columnaSeco(['Aseo', 'Comida'], true)).toBe('aseo-comida');
  });

  it('un manual creado desde "Todas" (sin sección) va a Mixto, no a Hogar', () => {
    expect(columnaSeco([], true)).toBe('mixto');
  });

  it('en Seco no hay columna de congelados: nunca se devuelve y la tarjeta no se pierde', () => {
    expect(columnaSeco(['Congelados'], true)).toBe('mixto');
    expect(columnaSeco(['Congelados', 'Chocolates'], false)).toBe('chocolates');
  });
});
