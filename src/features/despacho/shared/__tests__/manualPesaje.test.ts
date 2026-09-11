import { describe, it, expect } from 'vitest';
import {
  ALTO_AVISO_CM, nivelAlto, resumenPesaje, avisosAltoPorTienda, textoResumenPesaje,
  lineasPesaje, etiquetaAviso, textoManualParaCopiar,
} from '../manualPesaje';
import { MAX_ALTO_CM } from '../palletLimits';

const s = (store_cod: string, tipo: string, peso_kg: number | null, alto: number | null = null, picker_label: string | null = 'Ana') =>
  ({ store_cod, tipo, peso_kg, alto, picker_label });

describe('nivelAlto', () => {
  it('sobre el límite de bodega es "excede"', () => {
    expect(nivelAlto(MAX_ALTO_CM + 1)).toBe('excede');
    expect(nivelAlto(200)).toBe('excede');
  });

  it('justo en el límite todavía NO excede — el límite es el máximo permitido', () => {
    expect(nivelAlto(MAX_ALTO_CM)).toBe('cerca');
  });

  it('dentro de los últimos centímetros avisa como "cerca"', () => {
    expect(nivelAlto(ALTO_AVISO_CM)).toBe('cerca');
    expect(nivelAlto(180)).toBe('cerca');
  });

  it('por debajo de la banda de aviso no molesta', () => {
    expect(nivelAlto(ALTO_AVISO_CM - 1)).toBe('ok');
    expect(nivelAlto(120)).toBe('ok');
  });

  it('sin altura no se inventa un aviso', () => {
    // alto 0 es "sin pesar" (DIMS_SIN_PESAR), no un pallet de 0 cm.
    expect(nivelAlto(0)).toBe('ok');
    expect(nivelAlto(null)).toBe('ok');
  });
});

describe('resumenPesaje', () => {
  const cods = new Set(['01A', '02B']);

  it('cuenta pesados sobre el total de cada envase', () => {
    const r = resumenPesaje([
      s('01A', 'P', 300), s('01A', 'P', 0), s('01A', 'B', 12), s('02B', 'P', 250),
    ], cods);
    expect(r.p).toEqual({ pesados: 2, total: 3 });
    expect(r.b).toEqual({ pesados: 1, total: 1 });
  });

  it('el chocolate va APARTE de los bultos: se pide en su propia línea', () => {
    const r = resumenPesaje([s('01A', 'B', 10), s('01A', 'CH', 18), s('01A', 'CH', 0)], cods);
    expect(r.b).toEqual({ pesados: 1, total: 1 });
    expect(r.ch).toEqual({ pesados: 1, total: 2 });
  });

  it('las cajas de congelado NO cuentan: Manual es la Bodega de seco', () => {
    // Medido el 11/09/2026: 17 cajas CC/CN inflaban los "bultos" de 90 a 107 en 26 tiendas.
    const r = resumenPesaje([s('01A', 'CC', 10), s('01A', 'CN', 0), s('01A', 'B', 5)], cods);
    expect(r.b).toEqual({ pesados: 1, total: 1 });
    expect(r.todos.total).toBe(1);
  });

  it('el bucket "Sin asignar" no cuenta: son slots que nunca se imprimen', () => {
    const r = resumenPesaje([s('01A', 'P', 100, null, 'Sin asignar'), s('01A', 'P', 100)], cods);
    expect(r.p).toEqual({ pesados: 1, total: 1 });
  });

  it('peso 0 o ausente es SIN PESAR, no cero kilos', () => {
    const r = resumenPesaje([s('01A', 'P', 0), s('01A', 'P', null)], cods);
    expect(r.p).toEqual({ pesados: 0, total: 2 });
  });

  it('ignora las tiendas que no están en la selección (RM / Costa / Regiones)', () => {
    const r = resumenPesaje([s('01A', 'P', 100), s('99Z', 'P', 100)], new Set(['01A']));
    expect(r.todos).toEqual({ pesados: 1, total: 1 });
  });

  it('el porcentaje es sobre TODOS los envases juntos', () => {
    const r = resumenPesaje([s('01A', 'P', 100), s('01A', 'B', 0), s('01A', 'C', 0), s('01A', 'CH', 5)], cods);
    expect(r.todos).toEqual({ pesados: 2, total: 4 });
    expect(r.pct).toBe(50);
  });

  it('sin nada cargado el porcentaje es 0, no NaN', () => {
    // Dividir por cero acá pintaría "NaN%" en pantalla.
    const r = resumenPesaje([], cods);
    expect(r.pct).toBe(0);
    expect(Number.isNaN(r.pct)).toBe(false);
  });

  it('redondea a entero: nadie necesita 66,666%', () => {
    const r = resumenPesaje([s('01A', 'P', 1), s('01A', 'P', 1), s('01A', 'P', 0)], cods);
    expect(r.pct).toBe(67);
  });
});

describe('avisosAltoPorTienda', () => {
  const cods = new Set(['01A', '02B']);

  it('agrupa por tienda y cuenta cuántos van altos', () => {
    const av = avisosAltoPorTienda([
      s('01A', 'P', 100, 190), s('01A', 'P', 100, 175), s('01A', 'P', 100, 120),
    ], cods);
    expect(av['01A']).toEqual({ cerca: 1, excede: 1 });
  });

  it('una tienda sin pallets altos no aparece — el aviso es la excepción', () => {
    const av = avisosAltoPorTienda([s('01A', 'P', 100, 120)], cods);
    expect(av['01A']).toBeUndefined();
    expect(Object.keys(av)).toHaveLength(0);
  });

  it('solo mira PALLETS: el límite de 185 es de racks y camión', () => {
    const av = avisosAltoPorTienda([s('01A', 'B', 10, 190), s('01A', 'CH', 18, 190)], cods);
    expect(Object.keys(av)).toHaveLength(0);
  });

  it('respeta la selección de grupo', () => {
    const av = avisosAltoPorTienda([s('99Z', 'P', 100, 200)], new Set(['01A']));
    expect(av['99Z']).toBeUndefined();
  });
});

describe('lineasPesaje — una línea por tipo, cada una con su fracción y su porcentaje', () => {
  const cods = new Set(['01A']);

  it('arriba el total, y después Pallets, Bultos y Chocolates en líneas separadas', () => {
    const r = resumenPesaje([
      s('01A', 'P', 1), s('01A', 'P', 0),                         // 1/2 pallets
      s('01A', 'B', 5), s('01A', 'B', 5), s('01A', 'B', 0),        // 2/3 bultos
      s('01A', 'CH', 18), s('01A', 'CH', 18), s('01A', 'CH', 18), s('01A', 'CH', 0), // 3/4 chocolates
    ], cods);
    expect(lineasPesaje(r)).toEqual([
      'PESADOS: 6 de 9 (67%)',
      'Pallets: 1/2 (50%)',
      'Bultos: 2/3 (67%)',
      'Chocolates: 3/4 (75%)',
    ]);
  });

  it('un tipo que no hay no ocupa línea', () => {
    const r = resumenPesaje([s('01A', 'P', 1)], cods);
    expect(lineasPesaje(r)).toEqual(['PESADOS: 1 de 1 (100%)', 'Pallets: 1/1 (100%)']);
  });

  it('contenedores, si los hay, van en su propia línea al final', () => {
    const r = resumenPesaje([s('01A', 'C', 0)], cods);
    expect(lineasPesaje(r)).toContain('Contenedores: 0/1 (0%)');
  });

  it('sin nada cargado no hay líneas (ni un "0%")', () => {
    expect(lineasPesaje(resumenPesaje([], new Set()))).toEqual([]);
    expect(textoResumenPesaje(resumenPesaje([], new Set()))).toBe('');
  });
});

describe('etiquetaAviso', () => {
  it('dice cuántos pallets van altos, como en pantalla', () => {
    expect(etiquetaAviso({ cerca: 1, excede: 0 })).toBe('⚠ 1 alto');
    expect(etiquetaAviso({ cerca: 1, excede: 2 })).toBe('⚠ 3 altos');
  });
});

describe('textoManualParaCopiar — lo copiado dice lo mismo que la pantalla', () => {
  const lines = [
    { cod: '31TLC', p: 2, b: 3, c: 0, ch: 0 },
    { cod: '38SP2', p: 2, b: 0, c: 0, ch: 0 },
  ];
  const tot = { p: 4, b: 3, c: 0, ch: 0 };
  const r = resumenPesaje([s('31TLC', 'P', 100, 175), s('31TLC', 'P', 0), s('38SP2', 'B', 5)], new Set(['31TLC', '38SP2']));

  it('lleva el aviso de alto al lado de la tienda que lo tiene', () => {
    const t = textoManualParaCopiar(lines, tot, { '31TLC': { cerca: 1, excede: 0 } }, r);
    expect(t.split('\n')[0]).toBe('31TLC: 2P - 3B  ⚠ 1 alto');
    expect(t.split('\n')[1]).toBe('38SP2: 2P');
  });

  it('cierra con el TOTAL y el pesaje por tipo, en líneas separadas', () => {
    const t = textoManualParaCopiar(lines, tot, {}, r).split('\n');
    expect(t).toContain('TOTAL: 4P - 3B - 2 TIENDAS');
    expect(t).toContain('Pallets: 1/2 (50%)');
    expect(t).toContain('Bultos: 1/1 (100%)');
  });

  it('sin tiendas no hay nada que copiar', () => {
    expect(textoManualParaCopiar([], tot, {}, r)).toBe('');
  });
});
