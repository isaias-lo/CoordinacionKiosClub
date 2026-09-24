import { describe, it, expect, beforeEach } from 'vitest';
import { marcarLapida, levantarLapida, tieneLapida, llaveDeSlot, _limpiarLapidas } from '../lapidasBorrado';
import { mergeItemsByTienda, mergeListaPorItem, quitarLapidas } from '../../santiago/context/mergeItems';
import { stableItemKey } from '../formRowsReconcile';

/** Un chocolate cualquiera, con su unidad de Picking. */
const ch = (slot: number) => ({ pickingSlotId: slot, orden: `chocolate${slot}`, peso: 10 });

beforeEach(_limpiarLapidas);

describe('lapidasBorrado — la memoria de un borrado', () => {
  it('la llave tiene el mismo formato que stableItemKey', () => {
    expect(llaveDeSlot(14406)).toBe('slot:14406');
    expect(llaveDeSlot(14406)).toBe(stableItemKey(ch(14406)));
  });

  it('marcar y consultar', () => {
    expect(tieneLapida('slot:1')).toBe(false);
    marcarLapida(1);
    expect(tieneLapida('slot:1')).toBe(true);
  });

  it('volver a crear la unidad levanta la lápida — es la única forma de que el ítem vuelva', () => {
    marcarLapida(1);
    levantarLapida(1);
    expect(tieneLapida('slot:1')).toBe(false);
  });

  it('sin slot no hay lápida: un ítem manual no tiene llave estable con la que marcarlo', () => {
    marcarLapida(null);
    marcarLapida(undefined);
    expect(tieneLapida('slot:null')).toBe(false);
    expect(tieneLapida('slot:undefined')).toBe(false);
  });
});

describe('el borrado sobrevive a que avance la base (el 26% que volvía)', () => {
  it('tienda LIMPIA: el remoto viejo del otro equipo ya no devuelve los chocolates', () => {
    // A borró 4 chocolates y empujó: su base ya no los tiene.
    for (const n of [1, 2, 3, 4]) marcarLapida(n);
    const base   = { TLC: [] as ReturnType<typeof ch>[] };
    const local  = { TLC: [] as ReturnType<typeof ch>[] };
    // B no recibió el borrado todavía y empuja su copia, que sí los tiene.
    const remote = { TLC: [ch(1), ch(2), ch(3), ch(4)] };

    const out = mergeItemsByTienda(remote, local, base, stableItemKey, undefined, tieneLapida);
    expect(out.TLC).toEqual([]);
  });

  it('tienda SUCIA: tampoco', () => {
    for (const n of [1, 2, 3, 4]) marcarLapida(n);
    const pallet = (peso: number) => ({ pickingSlotId: 9, orden: 'pallet1', peso });
    const base   = { TLC: [pallet(200)] };
    const local  = { TLC: [pallet(250)] };  // además seguí editando la tienda
    const remote = { TLC: [pallet(200), ch(1), ch(2), ch(3), ch(4)] };

    const out = mergeItemsByTienda(remote, local, base, stableItemKey, undefined, tieneLapida);
    expect(out.TLC.map(i => i.orden)).toEqual(['pallet1']);
    expect(out.TLC[0].peso).toBe(250); // mi edición se conserva
  });

  it('limpia un zombi que un merge anterior ya había resucitado', () => {
    marcarLapida(2);
    const out = mergeListaPorItem([ch(1), ch(2)], [ch(1), ch(2)], [ch(1), ch(2)], stableItemKey, undefined, tieneLapida);
    expect(out.map(i => i.pickingSlotId)).toEqual([1]);
  });

  it('lo que NO se borró acá sigue llegando: la lápida no es un filtro general', () => {
    marcarLapida(1);
    const out = mergeItemsByTienda({ TLC: [ch(1), ch(2)] }, { TLC: [] }, { TLC: [] }, stableItemKey, undefined, tieneLapida);
    expect(out.TLC.map(i => i.pickingSlotId)).toEqual([2]);
  });

  it('tras Revertir, el ítem puede volver', () => {
    marcarLapida(1);
    levantarLapida(1);  // lo hace crearSlotBodega al recrear la unidad
    const out = mergeItemsByTienda({ TLC: [ch(1)] }, { TLC: [] }, { TLC: [] }, stableItemKey, undefined, tieneLapida);
    expect(out.TLC.map(i => i.pickingSlotId)).toEqual([1]);
  });

  it('sin el predicado, el comportamiento es el de antes (nadie más cambia)', () => {
    marcarLapida(1);
    const out = mergeItemsByTienda({ TLC: [ch(1)] }, { TLC: [] }, { TLC: [] }, stableItemKey);
    expect(out.TLC.length).toBe(1);
  });
});

describe('quitarLapidas — la adopción completa de RM/Costa', () => {
  it('filtra el mapa entero de tiendas', () => {
    marcarLapida(2);
    const out = quitarLapidas({ TLC: [ch(1), ch(2)], MCH: [ch(3)] }, stableItemKey, tieneLapida);
    expect(out.TLC.map(i => i.pickingSlotId)).toEqual([1]);
    expect(out.MCH.map(i => i.pickingSlotId)).toEqual([3]);
  });

  it('sin nada que quitar devuelve el MISMO objeto (no fuerza un render)', () => {
    const entrada = { TLC: [ch(1)] };
    expect(quitarLapidas(entrada, stableItemKey, tieneLapida)).toBe(entrada);
  });
});
