import { describe, it, expect } from 'vitest';
import { slotsSinTarjeta, slotsRepresentados } from '../slotsSinTarjeta';

const P  = (id: number) => ({ id, tipo: 'P',  contenido: 'hogar' });
const B  = (id: number) => ({ id, tipo: 'B',  contenido: 'aseo-comida' });
const CH = (id: number) => ({ id, tipo: 'CH', contenido: 'chocolates' });
const CC = (id: number) => ({ id, tipo: 'C',  contenido: 'congelados' });

describe('slotsRepresentados', () => {
  it('junta los pickingSlotId que las filas declaran', () => {
    expect(slotsRepresentados([{ pickingSlotId: 7 }, { pickingSlotId: 9 }])).toEqual(new Set([7, 9]));
  });

  it('una fila SIN pickingSlotId no representa nada', () => {
    expect(slotsRepresentados([{ pickingSlotId: null }, { pickingSlotId: undefined }, {}])).toEqual(new Set());
  });
});

describe('el bug que motivó esto: la fila guardó su ítem pero no anotó el slot', () => {
  const slots = [P(1)];

  it('con el slot declarado en la fila, NO falta tarjeta', () => {
    const filas = [{ pickingSlotId: 1 }];
    expect(slotsSinTarjeta(slots, slotsRepresentados(filas), [])).toEqual([]);
  });

  it('sin declararlo, el backfill lo cree ausente y agrega una SEGUNDA tarjeta', () => {
    const filas = [{ pickingSlotId: undefined }];   // la fila existe, pero no dice de qué slot es
    expect(slotsSinTarjeta(slots, slotsRepresentados(filas), [])).toHaveLength(1);
  });
});

describe('qué slots entran', () => {
  const vacio = new Set<number>();

  it('un pallet o bulto nuevo entra', () => {
    expect(slotsSinTarjeta([P(1), B(2)], vacio, []).map(s => s.id)).toEqual([1, 2]);
  });

  it('los congelados NO entran: tienen su propio tablero', () => {
    expect(slotsSinTarjeta([CC(3)], vacio, [])).toEqual([]);
  });

  it('el contenido congelado se detecta sin importar mayúsculas ni el texto exacto', () => {
    const raros = [
      { id: 4, tipo: 'B', contenido: 'CONGELADOS' },
      { id: 5, tipo: 'B', contenido: 'Congelado' },
      { id: 6, tipo: 'B', contenido: 'caja congelados negra' },
    ];
    expect(slotsSinTarjeta(raros, vacio, [])).toEqual([]);
  });

  it('un CH sin su ítem NO entra: el slot llega antes que el estado y haría parpadear la tarjeta', () => {
    expect(slotsSinTarjeta([CH(7)], vacio, [])).toEqual([]);
  });

  it('el mismo CH entra apenas su ítem existe — así aparece el chocolate de otra persona', () => {
    expect(slotsSinTarjeta([CH(7)], vacio, [{ pickingSlotId: 7 }]).map(s => s.id)).toEqual([7]);
  });

  it('un CH ya representado no entra aunque su ítem exista', () => {
    expect(slotsSinTarjeta([CH(7)], new Set([7]), [{ pickingSlotId: 7 }])).toEqual([]);
  });

  it('el ítem de OTRO chocolate no habilita a este', () => {
    expect(slotsSinTarjeta([CH(7)], vacio, [{ pickingSlotId: 8 }])).toEqual([]);
  });
});

describe('casos de borde', () => {
  it('sin slots no hay nada que agregar', () => {
    expect(slotsSinTarjeta([], new Set([1]), [])).toEqual([]);
  });

  it('contenido null no es congelado', () => {
    expect(slotsSinTarjeta([{ id: 1, tipo: 'P', contenido: null }], new Set(), []).map(s => s.id)).toEqual([1]);
  });

  it('devuelve los slots tal cual, sin copiarlos ni reordenarlos', () => {
    const a = P(1), b = B(2);
    expect(slotsSinTarjeta([a, b], new Set(), [])).toEqual([a, b]);
  });
});
