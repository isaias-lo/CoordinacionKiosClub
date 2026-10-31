import { describe, it, expect } from 'vitest';
import { isAbastecimientoOp, parseOrigin } from '../picking-utils';

// Los origins REALES de 62PLD, leídos de Odoo el 31/10/2026.
const APERTURA = [
  'Abastecimiento Apertura Comida 7 - 62PLD 30/10/2026',
  'Abastecimiento Apertura Hogar 1 - 62PLD 30/10/2026',
  'Abastecimiento Apertura Aseo 2 - 62PLD 30/10/2026',
  'Abastecimiento Apertura Chocolates 2 - 62PLD 30/10/2026',
  'Abastecimiento Apertura Comida 63CAL 28/10/2026',
];
const NORMAL = [
  'Abastecimiento Comida 05LP 30/10/2026',
  'Abastecimiento Aseo 26ALC 30/10/2026',
  'Abastecimiento Congelados 33CON 30/10/2026',
];

describe('una apertura SE VE en Picking', () => {
  it('EL BUG DEL 31/10: el filtro las descartaba en el cliente', () => {
    // Los 13 movimientos de 62PLD llegaban del servidor y `isAbastecimientoOp` los tiraba, porque
    // los keywords llevan las dos palabras pegadas y una apertura tiene «Apertura» en medio. La
    // tienda se veía vacía con la carga ahí.
    for (const o of APERTURA) expect(isAbastecimientoOp(o)).toBe(true);
  });

  it('y lleva su categoría, para que caiga en la pestaña correcta', () => {
    expect(parseOrigin(APERTURA[0]).categories).toEqual(['Comida']);
    expect(parseOrigin(APERTURA[1]).categories).toEqual(['Hogar']);
    expect(parseOrigin(APERTURA[2]).categories).toEqual(['Aseo']);
    expect(parseOrigin(APERTURA[3]).categories).toEqual(['Chocolates']);
  });

  it('con su código de tienda', () => {
    expect(parseOrigin(APERTURA[0]).storeCode).toBe('62PLD');
    expect(parseOrigin(APERTURA[4]).storeCode).toBe('63CAL');
  });
});

describe('lo que ya funcionaba no cambia', () => {
  it('un abastecimiento normal sigue pasando', () => {
    for (const o of NORMAL) expect(isAbastecimientoOp(o)).toBe(true);
  });

  it('lo que NO es abastecimiento sigue sin pasar', () => {
    for (const o of ['Traslado interno 05LP', 'Devolución 26ALC', '', 'cualquier cosa']) {
      expect(isAbastecimientoOp(o)).toBe(false);
    }
  });
});
