import { describe, it, expect } from 'vitest';
import { accionReclamo, avisoYaVisible, avisoRecuperado } from '../reclamoPreexistente';

describe('accionReclamo', () => {
  it('el caso que estaba roto: la base lo tiene y la pantalla no → se agrega', () => {
    expect(accionReclamo([{ pickingSlotId: 11 }, { pickingSlotId: 12 }], 99)).toBe('agregar');
  });

  it('si ya está a la vista no se duplica', () => {
    expect(accionReclamo([{ pickingSlotId: 11 }, { pickingSlotId: 99 }], 99)).toBe('ya_visible');
  });

  it('con la lista vacía siempre se agrega', () => {
    expect(accionReclamo([], 99)).toBe('agregar');
  });

  it('las filas SIN slot no cuentan: son ítems manuales, no este pallet', () => {
    expect(accionReclamo([{ pickingSlotId: null }, { pickingSlotId: undefined }, {}], 99)).toBe('agregar');
  });

  it('se compara por slot, no por posición: dos filas pueden decir "P3" y ser distintas', () => {
    // Misma lista, dos slots distintos: uno está y el otro no.
    const filas = [{ pickingSlotId: 501 }];
    expect(accionReclamo(filas, 501)).toBe('ya_visible');
    expect(accionReclamo(filas, 502)).toBe('agregar');
  });
});

describe('avisos', () => {
  it('dicen el número del pallet, que es lo que el operador tiene en la mano', () => {
    expect(avisoYaVisible(1050)).toContain('#1050');
    expect(avisoRecuperado(1050)).toContain('#1050');
  });

  it('el de recuperado explica POR QUÉ no estaba, en vez de solo confirmar', () => {
    expect(avisoRecuperado(1050)).toContain('faltaba en la lista');
  });
});
