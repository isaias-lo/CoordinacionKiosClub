import { describe, it, expect } from 'vitest';
import { agregarSinDuplicar, fusionarConPrevio, itemDeLaUnidad } from '../itemPorUnidad';

// Forma de un ítem de Bodega RM/Costa (SantiagoItem) reducida a lo que importa acá.
interface Item {
  id: string;
  orden: string;
  tipo: string;
  peso: number;
  alto: number;
  largo: number;
  ancho: number;
  pesoVolumetrico?: number;
  pickingSlotId?: number;
}

const sinPesar = (slot: number, over: Partial<Item> = {}): Item => ({
  id: `a-${slot}`, orden: '1B', tipo: 'Bulto', peso: 0, alto: 0, largo: 0, ancho: 0, pesoVolumetrico: 0, pickingSlotId: slot, ...over,
});
const pesado = (slot: number, over: Partial<Item> = {}): Item => ({
  id: `b-${slot}`, orden: '2B', tipo: 'Bulto', peso: 24, alto: 51, largo: 60, ancho: 40, pesoVolumetrico: 20.4, pickingSlotId: slot, ...over,
});

describe('agregarSinDuplicar', () => {
  it('agrega al final cuando la unidad no está en la lista', () => {
    const lista = [pesado(1)];
    expect(agregarSinDuplicar(lista, pesado(2))).toHaveLength(2);
  });

  it('agrega siempre un ítem sin unidad de Picking', () => {
    const lista = [pesado(1, { pickingSlotId: undefined })];
    expect(agregarSinDuplicar(lista, pesado(1, { pickingSlotId: undefined }))).toHaveLength(2);
  });

  it('01TPS: pesar en otro equipo un bulto guardado "sin pesar" deja UN ítem, con el peso', () => {
    const lista = [sinPesar(12997), pesado(12998, { orden: '3B' })];
    const out = agregarSinDuplicar(lista, pesado(12997));
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ pickingSlotId: 12997, peso: 24, alto: 51 });
  });

  it('el ítem reemplazado conserva su lugar, su id y su número', () => {
    const lista = [pesado(5), sinPesar(12997), pesado(6)];
    const out = agregarSinDuplicar(lista, pesado(12997));
    expect(out.map(i => i.pickingSlotId)).toEqual([5, 12997, 6]);
    expect(out[1]).toMatchObject({ id: 'a-12997', orden: '1B' });
  });

  it('no modifica la lista que recibe', () => {
    const lista = [sinPesar(12997)];
    agregarSinDuplicar(lista, pesado(12997));
    expect(lista[0].peso).toBe(0);
  });
});

describe('fusionarConPrevio', () => {
  it('"sin pesar" encima de un ítem pesado no borra el peso ni las medidas', () => {
    const out = fusionarConPrevio(pesado(1), sinPesar(1));
    expect(out).toMatchObject({ peso: 24, alto: 51, largo: 60, ancho: 40, pesoVolumetrico: 20.4 });
  });

  it('un peso nuevo encima de otro peso gana (es una corrección)', () => {
    const out = fusionarConPrevio(pesado(1), pesado(1, { peso: 30, alto: 55 }));
    expect(out).toMatchObject({ peso: 30, alto: 55 });
  });

  it('el resto de los campos viene del guardado nuevo', () => {
    const out = fusionarConPrevio(pesado(1, { tipo: 'Bulto' }), pesado(1, { tipo: 'Pallet' }));
    expect(out.tipo).toBe('Pallet');
  });

  it('fusionar dos veces da lo mismo que una', () => {
    const una = fusionarConPrevio(pesado(1), sinPesar(1));
    expect(fusionarConPrevio(pesado(1), una)).toEqual(una);
  });

  it('un ítem de Nacional (sin peso volumétrico) no gana ese campo', () => {
    const previo = { orden: 'bulto1', peso: 10, alto: 20, largo: 30, ancho: 40, pickingSlotId: 1 };
    const out = fusionarConPrevio(previo, { ...previo, peso: 0, alto: 0, largo: 0, ancho: 0 });
    expect(out).toEqual(previo);
    expect('pesoVolumetrico' in out).toBe(false);
  });
});

describe('itemDeLaUnidad', () => {
  it('encuentra el ítem de esa unidad', () => {
    expect(itemDeLaUnidad([pesado(1), pesado(2)], 2)?.id).toBe('b-2');
  });

  it('sin unidad no busca', () => {
    expect(itemDeLaUnidad([pesado(1, { pickingSlotId: undefined })], undefined)).toBeUndefined();
  });
});
