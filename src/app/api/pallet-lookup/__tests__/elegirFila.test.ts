import { describe, it, expect } from 'vitest';
import { elegirFilaDeDespacho, esBorradorDePicking } from '../elegirFila';

// ── LOS 82 IDS QUE DEVOLVÍAN EL BORRADOR ──────────────────────────────────────────────────────
//
// Medido el 07/10/2026: 95 ids viven en las dos tablas y en 82 la fila de `despacho_rm` está
// vacía mientras la de `despacho_regiones` tiene el peso. Como el buscador leía RM primero,
// escanear el QR de un pallet de Región precargaba el formulario con el código y sin conductor.

const borrador = { fuente: 'picking',         tienda: '47PTV',        conductor: '' };
const real     = { fuente: 'bodega_regiones', tienda: 'Puerto Varas', conductor: 'Luis Fica' };
const realRM   = { fuente: 'bodega_rm',       tienda: 'Los Toros',    conductor: 'Juan' };

describe('un borrador de Picking no le gana a una fila de verdad', () => {
  it('EL CASO P447PTV01102026P: gana «Puerto Varas», no «47PTV»', () => {
    const r = elegirFilaDeDespacho(borrador, real);
    expect(r).toEqual({ fila: real, tabla: 'despacho_regiones' });
  });

  it('al revés también: el borrador de Nacional no tapa la fila buena de RM', () => {
    const r = elegirFilaDeDespacho(realRM, { ...borrador, tienda: '01TPS' });
    expect(r).toEqual({ fila: realRM, tabla: 'despacho_rm' });
  });
});

describe('lo que no cambia', () => {
  it('si solo hay una, es esa', () => {
    expect(elegirFilaDeDespacho(realRM, null)).toEqual({ fila: realRM, tabla: 'despacho_rm' });
    expect(elegirFilaDeDespacho(null, real)).toEqual({ fila: real, tabla: 'despacho_regiones' });
  });

  it('si las dos son borradores gana RM, que es el orden de siempre', () => {
    const otro = { ...borrador, tienda: 'otro' };
    expect(elegirFilaDeDespacho(borrador, otro)).toEqual({ fila: borrador, tabla: 'despacho_rm' });
  });

  it('si las dos son reales gana RM: acá no hay con qué desempatar mejor', () => {
    expect(elegirFilaDeDespacho(realRM, real)).toEqual({ fila: realRM, tabla: 'despacho_rm' });
  });

  it('sin ninguna, null', () => {
    expect(elegirFilaDeDespacho(null, undefined)).toBeNull();
  });
});

describe('esBorradorDePicking', () => {
  it('reconoce la fuente, con espacios y mayúsculas', () => {
    expect(esBorradorDePicking({ fuente: 'picking' })).toBe(true);
    expect(esBorradorDePicking({ fuente: '  PICKING ' })).toBe(true);
  });

  it('una fila de Bodega, del Enrutador o sin fuente NO es borrador', () => {
    expect(esBorradorDePicking({ fuente: 'bodega_rm' })).toBe(false);
    expect(esBorradorDePicking({ fuente: 'enrutador' })).toBe(false);
    expect(esBorradorDePicking({ fuente: null })).toBe(false);
    expect(esBorradorDePicking(null)).toBe(false);
  });
});
