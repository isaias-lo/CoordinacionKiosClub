import { describe, it, expect } from 'vitest';
import { elegirVersion, sellarCambios } from '../versionDeItem';
import { mergeItemsByTienda } from '../../santiago/context/mergeItems';
import { stableItemKey } from '../formRowsReconcile';

type It = { id: string; pickingSlotId?: number; tipo: string; peso: number; alto: number; orden: string; editadoEn?: number };
const sinPesar = (t?: number): It => ({ id: 'x', pickingSlotId: 2679, tipo: 'Pallet', peso: 0, alto: 0, orden: 'P2', editadoEn: t });
const pesado   = (peso: number, t?: number): It => ({ id: 'x', pickingSlotId: 2679, tipo: 'Pallet', peso, alto: 150, orden: 'P2', editadoEn: t });

describe('elegirVersion', () => {
  it('entre dos selladas gana la más nueva', () => {
    expect(elegirVersion(pesado(72.5, 100), pesado(92, 200))).toBe('remoto');
    expect(elegirVersion(pesado(92, 300), pesado(72.5, 200))).toBe('local');
  });

  it('sin sello, el peso le gana al «sin pesar»', () => {
    expect(elegirVersion(pesado(72.5), sinPesar())).toBe('local');
    expect(elegirVersion(sinPesar(), pesado(72.5))).toBe('remoto');
  });

  it('con un solo sello también decide el peso', () => {
    expect(elegirVersion(pesado(72.5, 100), sinPesar())).toBe('local');
  });

  it('misma carga (solo cambia el número o el sello): no decide', () => {
    expect(elegirVersion(pesado(72.5, 1), { ...pesado(72.5, 2), orden: 'P3' })).toBeNull();
  });

  it('dos pesos distintos sin sello: no decide (queda la regla de siempre)', () => {
    expect(elegirVersion(pesado(72.5), pesado(92))).toBeNull();
  });
});

describe('sellarCambios', () => {
  it('sella lo nuevo y lo que cambió de carga; no lo renumerado', () => {
    const antes = [pesado(10, 5), { ...pesado(20, 5), id: 'y', pickingSlotId: 2 }];
    const despues = [{ ...pesado(10, 5), orden: 'P9' }, { ...pesado(25, 5), id: 'y', pickingSlotId: 2 }, { ...pesado(1), id: 'z', pickingSlotId: 3 }];
    const out = sellarCambios(antes, despues, stableItemKey, 999);
    expect(out.map(i => i.editadoEn)).toEqual([5, 999, 999]);
  });

  it('devuelve el mismo arreglo si no hay nada que sellar', () => {
    const lista = [pesado(10, 5)];
    expect(sellarCambios(lista, lista, stableItemKey, 999)).toBe(lista);
  });

  it('si al reconstruir el ítem se perdió el sello, se lo devuelve', () => {
    const out = sellarCambios([pesado(10, 5)], [pesado(10)], stableItemKey, 999);
    expect(out[0].editadoEn).toBe(5);
  });
});

describe('01TPS, 14/10/2026: una copia vieja ya no borra el peso', () => {
  // El equipo de Daniel pesó P2 (72,5) y empujó. Después el de Isaias, que todavía no lo había
  // recibido, empujó por otra tienda la fila entera con P2 «sin pesar». Daniel tiene 01TPS limpia.
  it('tienda limpia: se queda con su peso en vez de adoptar el «sin pesar» viejo', () => {
    const daniel = { '01TPS': [pesado(72.5, 2000)] };
    const remotoViejo = { '01TPS': [sinPesar(1000)] };
    const out = mergeItemsByTienda(remotoViejo, daniel, daniel, stableItemKey, undefined, undefined,
      (l: It, r: It) => elegirVersion(l, r));
    expect(out['01TPS'][0].peso).toBe(72.5);
  });

  it('y si el remoto trae una edición más nueva, se adopta', () => {
    const local = { '01TPS': [pesado(72.5, 2000)] };
    const remoto = { '01TPS': [pesado(92, 3000)] };
    const out = mergeItemsByTienda(remoto, local, local, stableItemKey, undefined, undefined,
      (l: It, r: It) => elegirVersion(l, r));
    expect(out['01TPS'][0].peso).toBe(92);
  });

  it('tienda editada acá: la versión más nueva del remoto gana a la local vieja', () => {
    const base = { '01TPS': [sinPesar(1000)] };
    const local = { '01TPS': [sinPesar(1000), { ...pesado(5, 1500), id: 'otro', pickingSlotId: 9 }] };
    const remoto = { '01TPS': [pesado(72.5, 2000)] };
    const out = mergeItemsByTienda(remoto, local, base, stableItemKey, undefined, undefined,
      (l: It, r: It) => elegirVersion(l, r));
    expect(out['01TPS'].find(i => i.pickingSlotId === 2679)!.peso).toBe(72.5);
  });
});
