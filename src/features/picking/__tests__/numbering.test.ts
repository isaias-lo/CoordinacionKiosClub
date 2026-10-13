import { describe, it, expect } from 'vitest';
import { computePalletNums, isSinAsignar, avisoNumerosDeBodega } from '../picking-utils';
import type { PalletSlot } from '../picking-types';

// Fábrica mínima de slots para el test de numeración
function slot(p: Partial<PalletSlot> & { id: number; store_cod: string; tipo: string; picker_label: string; created_at: string }): PalletSlot {
  return { state_key: '', contenido: 'hogar', refs: '', ...p } as PalletSlot;
}

describe('isSinAsignar', () => {
  it('detecta el bucket sin asignar sin importar mayúsculas/espacios', () => {
    expect(isSinAsignar('Sin asignar')).toBe(true);
    expect(isSinAsignar('  sin asignar ')).toBe(true);
    expect(isSinAsignar('Diego Far')).toBe(false);
    expect(isSinAsignar('')).toBe(false);
    expect(isSinAsignar(null)).toBe(false);
    expect(isSinAsignar(undefined)).toBe(false);
  });
});

describe('computePalletNums — [P6] excluye "Sin asignar"', () => {
  // Caso real 16PQA/CH (29/06): 3 CH "Sin asignar" (2816-8) + 2 CH de Diego (2820-1).
  // Antes salían 4,5; deben salir 1,2.
  const pqa: PalletSlot[] = [
    slot({ id: 2816, store_cod: '16PQA', tipo: 'CH', picker_label: 'Sin asignar', created_at: '2026-06-29T17:35:50.001Z' }),
    slot({ id: 2817, store_cod: '16PQA', tipo: 'CH', picker_label: 'Sin asignar', created_at: '2026-06-29T17:35:50.002Z' }),
    slot({ id: 2818, store_cod: '16PQA', tipo: 'CH', picker_label: 'Sin asignar', created_at: '2026-06-29T17:35:50.003Z' }),
    slot({ id: 2820, store_cod: '16PQA', tipo: 'CH', picker_label: 'Diego Far',   created_at: '2026-06-29T17:35:58.000Z' }),
    slot({ id: 2821, store_cod: '16PQA', tipo: 'CH', picker_label: 'Diego Far',   created_at: '2026-06-29T17:35:59.000Z' }),
  ];

  it('los CH del picker real numeran 1,2 (no 4,5)', () => {
    const nums = computePalletNums(pqa);
    expect(nums[2820]).toBe(1);
    expect(nums[2821]).toBe(2);
  });

  it('los slots "Sin asignar" no reciben número', () => {
    const nums = computePalletNums(pqa);
    expect(nums[2816]).toBeUndefined();
    expect(nums[2817]).toBeUndefined();
    expect(nums[2818]).toBeUndefined();
  });

  it('numera independiente por (store, tipo)', () => {
    const mixed: PalletSlot[] = [
      slot({ id: 1, store_cod: 'AAA', tipo: 'P', picker_label: 'Ana', created_at: '2026-06-29T10:00:00.000Z' }),
      slot({ id: 2, store_cod: 'AAA', tipo: 'P', picker_label: 'Ana', created_at: '2026-06-29T10:00:01.000Z' }),
      slot({ id: 3, store_cod: 'AAA', tipo: 'CH', picker_label: 'Ana', created_at: '2026-06-29T10:00:02.000Z' }),
      slot({ id: 4, store_cod: 'BBB', tipo: 'P', picker_label: 'Ana', created_at: '2026-06-29T10:00:03.000Z' }),
    ];
    const nums = computePalletNums(mixed);
    expect(nums[1]).toBe(1);
    expect(nums[2]).toBe(2);
    expect(nums[3]).toBe(1); // CH arranca en 1
    expect(nums[4]).toBe(1); // otra tienda arranca en 1
  });

  it('es determinista: ordena por created_at aunque el array venga desordenado (P7)', () => {
    const desordenado: PalletSlot[] = [
      slot({ id: 30, store_cod: 'AAA', tipo: 'P', picker_label: 'Ana', created_at: '2026-06-29T10:00:02.000Z' }),
      slot({ id: 10, store_cod: 'AAA', tipo: 'P', picker_label: 'Ana', created_at: '2026-06-29T10:00:00.000Z' }),
      slot({ id: 20, store_cod: 'AAA', tipo: 'P', picker_label: 'Ana', created_at: '2026-06-29T10:00:01.000Z' }),
    ];
    const nums = computePalletNums(desordenado);
    expect(nums[10]).toBe(1);
    expect(nums[20]).toBe(2);
    expect(nums[30]).toBe(3);
  });
});

describe('computePalletNums — respeta los números ya dados (06MQH, 12/10/2026)', () => {
  const MQH = '06MQH';
  // 2362 es el pallet web de Bodega (seq 1, Picking no lo muestra). 2365 y 2377 son de Picking.
  const picking: PalletSlot[] = [
    slot({ id: 2365, store_cod: MQH, tipo: 'P', picker_label: 'Martin Barraza', created_at: '2026-10-12T19:42:00.000Z' }),
    slot({ id: 2377, store_cod: MQH, tipo: 'P', picker_label: 'Maria Camila',   created_at: '2026-10-12T20:37:00.000Z' }),
  ];

  it('no repite el número que Bodega ya dio al pallet web', () => {
    const nums = computePalletNums(picking, { [`${MQH}::P`]: [1] });
    expect(nums[2365]).toBe(2);
    expect(nums[2377]).toBe(3);
  });

  it('el reservado de otro tipo o tienda no corre la numeración', () => {
    const nums = computePalletNums(picking, { [`${MQH}::B`]: [1], ['01TPS::P']: [1] });
    expect(nums[2365]).toBe(1);
    expect(nums[2377]).toBe(2);
  });

  it('un slot ya impreso conserva su número aunque su rango cambie', () => {
    const conSeq = [
      slot({ id: 1, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:00.000Z' }),
      slot({ id: 2, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:01.000Z', seq: 1 }),
    ];
    const nums = computePalletNums(conSeq);
    expect(nums[2]).toBe(1);
    expect(nums[1]).toBe(2);
  });

  it('los sin número toman los huecos más bajos, así un impreso no corre a los que faltan', () => {
    const huecos = [
      slot({ id: 1, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:00.000Z' }),
      slot({ id: 2, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:01.000Z', seq: 2 }),
      slot({ id: 3, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:02.000Z' }),
    ];
    const nums = computePalletNums(huecos);
    expect(nums).toEqual({ 1: 1, 2: 2, 3: 3 });
  });

  it('nunca da dos veces el mismo número dentro de tienda y tipo', () => {
    const varios = [
      slot({ id: 1, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:00.000Z', seq: 3 }),
      slot({ id: 2, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:01.000Z' }),
      slot({ id: 3, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:02.000Z' }),
      slot({ id: 4, store_cod: MQH, tipo: 'P', picker_label: 'Ana', created_at: '2026-10-12T10:00:03.000Z' }),
    ];
    const nums = computePalletNums(varios, { [`${MQH}::P`]: [1] });
    const usados = Object.values(nums);
    expect(new Set([...usados, 1]).size).toBe(usados.length + 1);
    expect(nums).toEqual({ 1: 3, 2: 2, 3: 4, 4: 5 });
  });
});

describe('avisoNumerosDeBodega — explica el salto en la numeración', () => {
  it('nombra el número que tomó Bodega', () => {
    expect(avisoNumerosDeBodega('06MQH', { '06MQH::P': [1] }, ['P', 'B', 'CH']))
      .toBe('P1 lo creó Bodega (por ejemplo, un pallet web) y no aparece aquí. Por eso la numeración de Picking se lo salta.');
  });

  it('junta varios en orden de tipo y número', () => {
    const t = avisoNumerosDeBodega('06MQH', { '06MQH::P': [2, 1], '06MQH::B': [1] }, ['P', 'B', 'CH']);
    expect(t?.startsWith('P1, P2 y B1 los creó Bodega')).toBe(true);
  });

  it('no avisa por otra tienda ni por tipos que esta vista no muestra', () => {
    expect(avisoNumerosDeBodega('06MQH', { '01TPS::P': [1], '06MQH::W': [1] }, ['P', 'B', 'CH'])).toBeNull();
  });
});
