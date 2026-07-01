import { describe, it, expect } from 'vitest';
import { computePalletNums, isSinAsignar } from '../picking-utils';
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
