import { describe, it, expect } from 'vitest';
import { resumenDiferencia } from '../recepcionDiff';

describe('resumenDiferencia', () => {
  it('sin diferencia cuando enviado == recibido', () => {
    const r = resumenDiferencia({ pallets_sent: 2, pallets_recibidos: 2, bultos_sent: 1, bultos_recibidos: 1 });
    expect(r.hayDiferencia).toBe(false);
    expect(r.detalles).toEqual([]);
  });

  it('detecta diferencia en pallets (recibió MÁS)', () => {
    // Caso real: cod 35BN2, enviado 2, recibido 4.
    const r = resumenDiferencia({ pallets_sent: 2, pallets_recibidos: 4 });
    expect(r.hayDiferencia).toBe(true);
    expect(r.detalles).toContain('P: 2→4');
  });

  it('detecta diferencia en bultos (recibió menos)', () => {
    const r = resumenDiferencia({ bultos_sent: 3, bultos_recibidos: 1 });
    expect(r.hayDiferencia).toBe(true);
    expect(r.detalles).toContain('B: 3→1');
  });

  it('detecta diferencia en contenedores', () => {
    const r = resumenDiferencia({ contenedores_sent: 2, contenedores_recibidos: 0 });
    expect(r.hayDiferencia).toBe(true);
    expect(r.detalles).toContain('C: 2→0');
  });

  it('acumula múltiples diferencias', () => {
    const r = resumenDiferencia({ pallets_sent: 2, pallets_recibidos: 1, bultos_sent: 0, bultos_recibidos: 3 });
    expect(r.detalles).toEqual(['P: 2→1', 'B: 0→3']);
  });

  it('trata null/undefined/no-numérico como 0', () => {
    expect(resumenDiferencia({}).hayDiferencia).toBe(false);
    expect(resumenDiferencia({ pallets_sent: null, pallets_recibidos: undefined }).hayDiferencia).toBe(false);
    expect(resumenDiferencia({ pallets_sent: 'x', pallets_recibidos: 2 }).detalles).toContain('P: 0→2');
  });
});
