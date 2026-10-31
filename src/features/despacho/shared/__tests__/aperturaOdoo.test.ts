import { describe, it, expect } from 'vitest';
import {
  esApertura, categoriaDeOrigin, agruparAperturas, diaPropuesto, desgloseEnPalabras,
  type MovimientoApertura,
} from '../aperturaOdoo';

// Los origins REALES de 62PLD y 63CAL, leídos de Odoo el 31/10/2026.
const O = (n: string) => `Abastecimiento Apertura ${n} - 62PLD 30/10/2026`;
const mov = (ref: string, origin: string, dia: string): MovimientoApertura => ({ ref, origin, dia });

describe('esApertura', () => {
  it('reconoce los de 62PLD y 63CAL', () => {
    expect(esApertura('Abastecimiento Apertura Comida 7 - 62PLD 30/10/2026')).toBe(true);
    expect(esApertura('Abastecimiento Apertura Comida 63CAL 28/10/2026')).toBe(true);
  });

  it('NO confunde un abastecimiento normal', () => {
    expect(esApertura('Abastecimiento Aseo 26ALC 30/10/2026')).toBe(false);
    expect(esApertura('Abastecimiento Comida 05LP 30/10/2026')).toBe(false);
  });

  it('no se cae con nada', () => {
    expect(esApertura(null)).toBe(false);
    expect(esApertura(undefined)).toBe(false);
    expect(esApertura('')).toBe(false);
  });
});

describe('categoriaDeOrigin · el bug que dejaba las aperturas sin categoría', () => {
  it('EL CASO: con «Apertura» en medio, que el mapa de Picking no veía', () => {
    // `ABAST_KEYWORDS` busca 'Abastecimiento Comida' con las dos palabras pegadas, así que los
    // 16 movimientos de 62PLD salían con categorías vacías.
    expect(categoriaDeOrigin(O('Comida 7'))).toBe('Comida');
    expect(categoriaDeOrigin(O('Hogar 1'))).toBe('Hogar');
    expect(categoriaDeOrigin(O('Aseo 2'))).toBe('Aseo');
    expect(categoriaDeOrigin(O('Chocolates 2'))).toBe('Chocolates');
  });

  it('un abastecimiento normal sigue funcionando igual', () => {
    expect(categoriaDeOrigin('Abastecimiento Aseo 26ALC 30/10/2026')).toBe('Aseo');
    expect(categoriaDeOrigin('Abastecimiento Comida 05LP 30/10/2026')).toBe('Comida');
    expect(categoriaDeOrigin('Abastecimiento Congelados 33CON 30/10/2026')).toBe('Congelados');
  });

  it('«Chocolate» y «Chocolates» son la misma categoría', () => {
    expect(categoriaDeOrigin('Abastecimiento Chocolate 18FLO 30/10/2026')).toBe('Chocolates');
    expect(categoriaDeOrigin('Abastecimiento Chocolates 38SP2 30/10/2026')).toBe('Chocolates');
  });

  it('sin categoría reconocible, null', () => {
    expect(categoriaDeOrigin('AUDITORIA Abastecimiento 39PSB')).toBeNull();
    expect(categoriaDeOrigin('cualquier cosa')).toBeNull();
    expect(categoriaDeOrigin(null)).toBeNull();
  });
});

describe('agruparAperturas · un día, nunca un rango', () => {
  it('EL CASO DE 62PLD: 16 movimientos de un solo día', () => {
    const movs = [
      ...Array.from({ length: 7 }, (_, i) => mov(`r${i}`, O(`Comida ${i + 1}`), '2026-10-30')),
      ...Array.from({ length: 5 }, (_, i) => mov(`h${i}`, O(`Hogar ${i + 1}`), '2026-10-30')),
      ...Array.from({ length: 2 }, (_, i) => mov(`a${i}`, O(`Aseo ${i + 1}`), '2026-10-30')),
      ...Array.from({ length: 2 }, (_, i) => mov(`c${i}`, O(`Chocolates ${i + 1}`), '2026-10-30')),
    ];
    const dias = agruparAperturas(movs);
    expect(dias).toHaveLength(1);
    expect(dias[0].dia).toBe('2026-10-30');
    expect(dias[0].total).toBe(16);
    expect(desgloseEnPalabras(dias[0])).toBe('7 Comida · 5 Hogar · 2 Aseo · 2 Chocolates');
  });

  it('EL CASO DE 63CAL: dos días NO se suman, se separan', () => {
    // Es la regla que importa. Sumarlos daría «20 movimientos» y nadie sabría que son dos lotes.
    const movs = [
      mov('a', O('Comida 1'), '2026-10-27'),
      mov('b', O('Comida 2'), '2026-10-27'),
      mov('c', O('Comida 1'), '2026-10-28'),
      mov('d', O('Hogar 1'), '2026-10-28'),
    ];
    const dias = agruparAperturas(movs);
    expect(dias.map(d => [d.dia, d.total])).toEqual([['2026-10-28', 2], ['2026-10-27', 2]]);
  });

  it('el más reciente va primero', () => {
    const movs = [
      mov('v', O('Comida 1'), '2026-10-24'),
      mov('n', O('Comida 1'), '2026-10-30'),
      mov('m', O('Comida 1'), '2026-10-27'),
    ];
    expect(agruparAperturas(movs).map(d => d.dia)).toEqual(['2026-10-30', '2026-10-27', '2026-10-24']);
  });

  it('un día mal formado no entra ni rompe el resto', () => {
    const movs = [mov('a', O('Comida 1'), '2026-10-30'), mov('b', O('Comida 2'), 'basura'), mov('c', O('Comida 3'), '')];
    const dias = agruparAperturas(movs);
    expect(dias).toHaveLength(1);
    expect(dias[0].total).toBe(1);
  });

  it('sin movimientos, lista vacía', () => {
    expect(agruparAperturas([])).toEqual([]);
  });

  it('guarda las referencias, para poder rastrearlas después', () => {
    const dias = agruparAperturas([mov('99REC/DT/145375', O('Comida 7'), '2026-10-30')]);
    expect(dias[0].refs).toEqual(['99REC/DT/145375']);
  });
});

describe('diaPropuesto · el más reciente, no el que más tiene', () => {
  it('63CAL: propone el 28 aunque el 27 tuviera más', () => {
    // Si Abastecimiento volvió a cargar, la segunda carga es la que vale.
    const movs = [
      ...Array.from({ length: 12 }, (_, i) => mov(`v${i}`, O('Comida 1'), '2026-10-27')),
      ...Array.from({ length: 4 }, (_, i) => mov(`n${i}`, O('Comida 1'), '2026-10-28')),
    ];
    const p = diaPropuesto(agruparAperturas(movs));
    expect(p?.dia).toBe('2026-10-28');
    expect(p?.total).toBe(4);
  });

  it('sin días, null', () => {
    expect(diaPropuesto([])).toBeNull();
  });
});

describe('desgloseEnPalabras', () => {
  it('vacío cuando no hay nada que decir', () => {
    expect(desgloseEnPalabras(null)).toBe('');
    expect(desgloseEnPalabras(undefined)).toBe('');
  });

  it('una sola categoría se dice sola', () => {
    const dias = agruparAperturas([mov('a', O('Comida 1'), '2026-10-30')]);
    expect(desgloseEnPalabras(dias[0])).toBe('1 Comida');
  });
});
