import { describe, it, expect, beforeEach } from 'vitest';
import { marcarLapida, levantarLapida, tieneLapida, llaveDeSlot, _limpiarLapidas, lapidasComoLista, absorberLapidas, levantarLapidasDeSlotsVivos } from '../lapidasBorrado';
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

describe('lapidasBorrado — compartidas entre equipos (29/09)', () => {
  it('lo que marco sale en la lista que viaja en el estado sincronizado', () => {
    marcarLapida(7);
    expect(lapidasComoLista()).toEqual(['slot:7']);
  });

  it('absorbe las lápidas de otro equipo y el merge descarta ese ítem', () => {
    absorberLapidas(['slot:2']);
    const merged = mergeItemsByTienda({ TLC: [ch(1), ch(2)] }, { TLC: [ch(1), ch(2)] }, { TLC: [ch(1), ch(2)] },
      stableItemKey, undefined, tieneLapida);
    expect(merged).toEqual({ TLC: [ch(1)] });
  });

  it('ignora basura: solo acepta llaves de slot y de id de ítem (15/10), no de orden', () => {
    absorberLapidas(['id:x', 'orden:P1', 42, null, 'slot:9']);
    absorberLapidas(undefined);
    absorberLapidas('slot:3');
    expect(lapidasComoLista().sort()).toEqual(['id:x', 'slot:9']);
  });
});

// ── UNA LÁPIDA NO PUEDE SOBREVIVIR A SU UNIDAD (30/09/2026) ────────────────────────────────────
//
// El archivo se apoyaba en que un id de `picking_pallets` nunca se reutiliza. Es cierto para
// unidades DISTINTAS, pero existe un RESTAURAR que revive la misma unidad con el mismo id:
//
//     16PQA  bulto  borrado 11:15:48  →  RESTAURADO 11:47:48, mismo id 484
//     12LAS  pallet borrado 17:39:54  →  restaurado después, mismo id 549
//
// El coordinador agregó el mismo bulto DOCE veces entre las 15:40 y las 18:29: el peso se guardaba
// y un segundo después el merge le borraba la tarjeta. No pudo registrar el día.

describe('la unidad volvió a existir — su lápida no vale', () => {
  it('EL CASO: borrada y restaurada con el MISMO id', () => {
    marcarLapida(484);
    expect(tieneLapida('slot:484')).toBe(true);
    levantarLapidasDeSlotsVivos([484]);          // la recarga de picking la ve viva
    expect(tieneLapida('slot:484')).toBe(false);
  });

  it('y el otro equipo NO la puede reinyectar', () => {
    // Limpiar el estado compartido no servía: cada pestaña tenía las lápidas en memoria y las
    // volvía a empujar a los pocos segundos. Medido el 30/09: sacarla y verla volver.
    marcarLapida(484);
    levantarLapidasDeSlotsVivos([484]);
    absorberLapidas(['slot:484', 'slot:999']);
    expect(tieneLapida('slot:484')).toBe(false);  // levantada: no vuelve
    expect(tieneLapida('slot:999')).toBe(true);   // una ajena normal sí entra
  });

  it('tampoco se sigue empujando a los demás', () => {
    marcarLapida(484);
    marcarLapida(999);
    levantarLapidasDeSlotsVivos([484]);
    expect(lapidasComoLista()).toEqual(['slot:999']);
  });

  it('si DESPUÉS se borra de verdad, la lápida vuelve a valer', () => {
    // Levantar no puede ser una inmunidad permanente: sería el bug contrario.
    marcarLapida(484);
    levantarLapidasDeSlotsVivos([484]);
    marcarLapida(484);
    expect(tieneLapida('slot:484')).toBe(true);
    absorberLapidas(['slot:484']);
    expect(tieneLapida('slot:484')).toBe(true);
  });

  it('levanta varias de una, que es como llega la recarga', () => {
    marcarLapida(549); marcarLapida(550); marcarLapida(484);
    levantarLapidasDeSlotsVivos([549, 484]);
    expect(tieneLapida('slot:549')).toBe(false);
    expect(tieneLapida('slot:484')).toBe(false);
    expect(tieneLapida('slot:550')).toBe(true);   // esa sí se borró de verdad
  });

  it('una lista vacía no toca nada', () => {
    marcarLapida(1);
    levantarLapidasDeSlotsVivos([]);
    expect(tieneLapida('slot:1')).toBe(true);
  });
});

// 07/10, 42ANP y 39PSB: Erick une P2 con P1. Las escrituras de la unión (peso y referencias de P1)
// disparan la recarga de picking en el equipo de Isaías ANTES de que el borrado de P2 llegue. Esa
// recarga ve a P2 vivo; dos segundos después llega su lápida y se rechazaba. P2 se quedaba para
// siempre en ese equipo y había que borrarlo a mano.
describe('ver viva una unidad antes de que llegue su lápida no la inmuniza', () => {
  it('EL CASO: la recarga ve a P2 vivo, y DESPUÉS llega la lápida de la unión', () => {
    levantarLapidasDeSlotsVivos([1534, 1532]);   // recarga en vuelo: P2 todavía en la base
    absorberLapidas(['slot:1534']);              // llega el push de quien unió
    expect(tieneLapida('slot:1534')).toBe(true);
  });

  it('la lápida absorbida se sigue empujando a los demás', () => {
    levantarLapidasDeSlotsVivos([1538]);
    absorberLapidas(['slot:1538']);
    expect(lapidasComoLista()).toEqual(['slot:1538']);
  });

  it('el restaurar sigue funcionando: la que SÍ tenía lápida se levanta y no vuelve', () => {
    absorberLapidas(['slot:484']);
    levantarLapidasDeSlotsVivos([484]);
    expect(tieneLapida('slot:484')).toBe(false);
    absorberLapidas(['slot:484']);
    expect(tieneLapida('slot:484')).toBe(false);
  });
});

describe('ítems sin unidad de Picking también dejan lápida (15/10)', () => {
  it('borrar un ítem sin slot deja lápida de su id, y viaja', async () => {
    const { anotarItemSinUnidad } = await import('../lapidasBorrado');
    anotarItemSinUnidad({ id: 'abc' }, 'borrado');
    expect(tieneLapida('id:abc')).toBe(true);
    expect(lapidasComoLista()).toContain('id:abc');
  });

  it('un ítem con slot no deja lápida de id (la deja su slot)', async () => {
    const { anotarItemSinUnidad } = await import('../lapidasBorrado');
    anotarItemSinUnidad({ id: 'abc', pickingSlotId: 7 }, 'borrado');
    expect(tieneLapida('id:abc')).toBe(false);
  });

  it('el Revertir que lo devuelve sin slot le levanta la lápida, y un remoto no se la reinyecta', async () => {
    const { anotarItemSinUnidad } = await import('../lapidasBorrado');
    anotarItemSinUnidad({ id: 'abc' }, 'borrado');
    anotarItemSinUnidad({ id: 'abc' }, 'vivo');
    expect(tieneLapida('id:abc')).toBe(false);
    absorberLapidas(['id:abc']);
    expect(tieneLapida('id:abc')).toBe(false);
  });

  it('absorbe lápidas de id de otro equipo, pero no las de orden', () => {
    absorberLapidas(['id:xyz', 'orden:pallet1']);
    expect(tieneLapida('id:xyz')).toBe(true);
    expect(tieneLapida('orden:pallet1')).toBe(false);
  });

  it('B2: editar un ítem sin slot lo enlaza y el otro equipo no queda con dos', async () => {
    const { marcarLapidaDeItem } = await import('../lapidasBorrado');
    type I = { id: string; pickingSlotId?: number; peso: number };
    // Equipo B tiene el ítem viejo, sin slot. Equipo A lo editó: mismo id, ahora con slot 50.
    const localB: Record<string, I[]> = { T1: [{ id: 'X', peso: 0 }] };
    const remotoA: Record<string, I[]> = { T1: [{ id: 'X', pickingSlotId: 50, peso: 72 }] };
    // Sin la lápida, B suma los dos.
    const sin = mergeItemsByTienda(remotoA, localB, localB, stableItemKey);
    expect(sin.T1).toHaveLength(2);
    // A marca la lápida de `id:X` al enlazar; viaja en el mismo push.
    marcarLapidaDeItem('X');
    const con = mergeItemsByTienda(remotoA, localB, localB, stableItemKey, undefined, tieneLapida);
    expect(con.T1).toEqual([{ id: 'X', pickingSlotId: 50, peso: 72 }]);
  });
});
