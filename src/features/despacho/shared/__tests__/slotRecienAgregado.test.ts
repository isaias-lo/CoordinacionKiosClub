import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  marcarRecienAgregado, slotsRecienAgregados, faltantesEnLaConsulta, _limpiarRecienAgregados,
  type SlotRecienAgregado,
} from '../slotRecienAgregado';
import type { PickingSlot } from '../../santiago/components/PickingSlotCards';

const slot = (id: number, tipo = 'P'): PickingSlot => ({
  id, tipo, contenido: 'hogar', seq: 1, canonical_id: null,
  peso_kg: null, alto: null, largo: null, ancho: null, peso_v: null, picker_label: 'Bodega',
});
const reciente = (id: number, cod = '04PDG'): SlotRecienAgregado => ({ storeCod: cod, slot: slot(id) });

/** Cómo indexa cada espejo: RM/Costa por código, Nacional por nombre. */
const porCodigo = (cod: string) => cod;
const porNombre = (cod: string) => ({ '04PDG': 'Principe de Gales' } as Record<string, string>)[cod];

beforeEach(() => _limpiarRecienAgregados());

describe('el bug: la recarga hacía desaparecer el pallet recién agregado', () => {
  it('si la consulta NO trajo el slot nuevo, se re-agrega', () => {
    const full = { '04PDG': [slot(1)] };                 // la consulta trajo el viejo, no el nuevo
    const r = faltantesEnLaConsulta(full, [reciente(2)], porCodigo);
    expect(r).toEqual([{ clave: '04PDG', slot: slot(2) }]);
  });

  it('si la consulta SÍ lo trajo, no se duplica', () => {
    const full = { '04PDG': [slot(1), slot(2)] };
    expect(faltantesEnLaConsulta(full, [reciente(2)], porCodigo)).toEqual([]);
  });

  it('la tienda sin ninguna fila en la consulta también recupera su slot', () => {
    // El caso más filoso: el primer pallet de la tienda. La consulta no devuelve NADA para ella,
    // así que sin esto la tarjeta desaparecía entera.
    expect(faltantesEnLaConsulta({}, [reciente(9)], porCodigo))
      .toEqual([{ clave: '04PDG', slot: slot(9) }]);
  });
});

describe('cada espejo indexa distinto', () => {
  it('Nacional traduce el código a nombre de tienda', () => {
    const r = faltantesEnLaConsulta({}, [reciente(3)], porNombre);
    expect(r).toEqual([{ clave: 'Principe de Gales', slot: slot(3) }]);
  });

  it('una tienda que no es de este tablero se ignora, no se inventa una entrada', () => {
    expect(faltantesEnLaConsulta({}, [reciente(4, '28TEM')], porNombre)).toEqual([]);
  });
});

describe('varios a la vez', () => {
  it('rescata los que faltan y deja los que ya vinieron', () => {
    const full = { '04PDG': [slot(1)] };
    const r = faltantesEnLaConsulta(full, [reciente(1), reciente(2), reciente(3)], porCodigo);
    expect(r.map(x => x.slot.id)).toEqual([2, 3]);
  });

  it('sin nada reciente no cambia nada', () => {
    expect(faltantesEnLaConsulta({ '04PDG': [slot(1)] }, [], porCodigo)).toEqual([]);
  });
});

describe('el registro expira solo', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un slot marcado está disponible al instante', () => {
    marcarRecienAgregado('04PDG', slot(7));
    expect(slotsRecienAgregados().map(s => s.slot.id)).toEqual([7]);
  });

  it('a los 5 s se limpia: pasado ese margen la consulta ya debería traerlo', () => {
    marcarRecienAgregado('04PDG', slot(7));
    vi.advanceTimersByTime(5000);
    expect(slotsRecienAgregados()).toEqual([]);
  });

  it('justo antes de los 5 s todavía protege', () => {
    marcarRecienAgregado('04PDG', slot(7));
    vi.advanceTimersByTime(4999);
    expect(slotsRecienAgregados()).toHaveLength(1);
  });

  it('marcar el mismo id dos veces no lo duplica', () => {
    marcarRecienAgregado('04PDG', slot(7));
    marcarRecienAgregado('04PDG', slot(7));
    expect(slotsRecienAgregados()).toHaveLength(1);
  });

  it('cada slot expira por su cuenta', () => {
    marcarRecienAgregado('04PDG', slot(1));
    vi.advanceTimersByTime(3000);
    marcarRecienAgregado('04PDG', slot(2));
    vi.advanceTimersByTime(2500);                 // 5500 para el primero, 2500 para el segundo
    expect(slotsRecienAgregados().map(s => s.slot.id)).toEqual([2]);
  });
});
