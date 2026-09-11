import { describe, it, expect } from 'vitest';
import {
  ALTO_AVISO_CM, nivelAlto, resumenPesaje, avisosAltoPorTienda, textoResumenPesaje,
} from '../manualPesaje';
import { MAX_ALTO_CM } from '../palletLimits';

const s = (store_cod: string, tipo: string, peso_kg: number | null, alto: number | null = null) =>
  ({ store_cod, tipo, peso_kg, alto });

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

  it('el chocolate cuenta como bulto, igual que en la línea TOTAL', () => {
    const r = resumenPesaje([s('01A', 'B', 10), s('01A', 'CH', 18)], cods);
    expect(r.b).toEqual({ pesados: 2, total: 2 });
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

describe('textoResumenPesaje', () => {
  it('dice cuántos de cuántos y el porcentaje', () => {
    const r = resumenPesaje([s('01A', 'P', 1), s('01A', 'P', 0), s('01A', 'B', 5)], new Set(['01A']));
    expect(textoResumenPesaje(r)).toBe('PESADOS: 2 de 3 (67%) · 1/2 P · 1/1 B');
  });

  it('sin nada cargado no escribe una línea vacía ni un 0%', () => {
    expect(textoResumenPesaje(resumenPesaje([], new Set()))).toBe('');
  });

  it('omite el envase que no tiene ninguno', () => {
    const r = resumenPesaje([s('01A', 'P', 1)], new Set(['01A']));
    expect(textoResumenPesaje(r)).toBe('PESADOS: 1 de 1 (100%) · 1/1 P');
  });
});
