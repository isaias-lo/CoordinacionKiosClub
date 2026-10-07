import { describe, it, expect } from 'vitest';
import { dominioDespachosDelDia, TIPO_DESPACHO_A_TIENDAS } from '../crucePesosDia';

// ── EL CASO 38SP2 DEL 07/10/2026 ──────────────────────────────────────────────────────────────
//
// CRUCE PESOS le abrió fila a 38SP2 —Paseo San Pedro de la Paz— justo después de dar REGISTRAR en
// RM/Costa, con una tienda que ni siquiera estaba en el calendario del día y que no es de RM.
//
// No fue el registro: REGISTRAR dispara el recálculo del día, y el recálculo le pide a Odoo los
// movimientos. El filtro era `origin like 'Abastecimiento'`, y `origin` es TEXTO LIBRE que los
// traslados entre tiendas escriben igual:
//
//     38SP2/INT/01490  «Abastecimiento Comida Para SP2 desde PUC»   74,2 kg   75PUC → 38SP2
//     31TLC/INT/01536  «Guía de Abastecimiento Hogar 23/09/2026»   152,6 kg
//
// Medido contra Odoo del 01/08 al 07/10 (52 días): de 9.306 movimientos que traía ese filtro, 680
// (7,3%) no eran despachos del CD. Con el tipo de operación: 8.618 y cero impostores.

describe('el cruce solo mira lo que el CD despachó a una tienda', () => {
  const dominio = dominioDespachosDelDia('2026-10-07');

  it('EL ARREGLO: filtra por el TIPO DE OPERACIÓN de Odoo', () => {
    // Sin esta condición volvían los traslados entre tiendas, las mermas y los ajustes.
    expect(dominio).toContainEqual(['picking_type_id.name', '=', 'Despacho Tiendas']);
  });

  it('conserva las cuatro condiciones que ya estaban', () => {
    // El tipo se SUMA, no reemplaza: `origin` sigue acotando a abastecimiento, y el estado a lo
    // que de verdad salió. Quitar cualquiera de estas cambiaría los números del cruce.
    expect(dominio).toContainEqual(['origin', 'like', 'Abastecimiento']);
    expect(dominio).toContainEqual(['date_done', '>=', '2026-10-07 00:00:00']);
    expect(dominio).toContainEqual(['date_done', '<=', '2026-10-07 23:59:59']);
    expect(dominio).toContainEqual(['state', '=', 'done']);
  });

  it('el día entero, de 00:00:00 a 23:59:59', () => {
    const d = dominioDespachosDelDia('2026-09-28');
    expect(d).toContainEqual(['date_done', '>=', '2026-09-28 00:00:00']);
    expect(d).toContainEqual(['date_done', '<=', '2026-09-28 23:59:59']);
  });

  it('cinco condiciones, ni una más', () => {
    // Si alguien agrega una sexta sin pensarlo, este test obliga a mirar qué deja afuera.
    expect(dominio).toHaveLength(5);
  });

  it('el nombre del tipo va en una constante, no suelto en el dominio', () => {
    expect(TIPO_DESPACHO_A_TIENDAS).toBe('Despacho Tiendas');
  });
});
