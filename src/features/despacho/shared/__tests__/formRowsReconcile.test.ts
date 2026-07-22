import { describe, it, expect } from 'vitest';
import {
  stableItemKey,
  reconcileSavedRows,
  findItemForRow,
  sameStableItem,
  type ReconcilableRow,
} from '../formRowsReconcile';

/* ── Modelos mínimos que imitan Regiones (DispatchItem: orden, pkg, sin id) y
   Santiago (SantiagoItem: id + orden). ────────────────────────────────────── */
type RegItem = { pkg: string; orden: string; peso: number; pickingSlotId?: number };
type SantItem = { id: string; orden: string; peso: number; pickingSlotId?: number };

type Row<Item> = ReconcilableRow<Item> & { pkg?: string; peso?: string };

describe('stableItemKey', () => {
  it('prefiere pickingSlotId sobre id y orden', () => {
    expect(stableItemKey({ pickingSlotId: 7, id: 'x', orden: 'pallet1' })).toBe('slot:7');
  });
  it('usa id cuando no hay slot', () => {
    expect(stableItemKey({ id: 'abc', orden: 'pallet1' })).toBe('id:abc');
  });
  it('cae a orden cuando no hay slot ni id (Regiones manual)', () => {
    expect(stableItemKey({ orden: 'pallet2' })).toBe('orden:pallet2');
  });
  it('devuelve cadena vacía cuando no hay ninguna clave', () => {
    expect(stableItemKey({})).toBe('');
  });
});

describe('sameStableItem', () => {
  it('empareja por slot aunque el orden haya cambiado (renumber)', () => {
    const a: RegItem = { pkg: 'pallet', orden: 'pallet1', peso: 10, pickingSlotId: 5 };
    const b: RegItem = { pkg: 'pallet', orden: 'pallet3', peso: 10, pickingSlotId: 5 };
    expect(sameStableItem(a, b)).toBe(true);
  });
  it('NO empareja dos ítems con el MISMO orden pero distinto slot (bug: borraba el chocolate equivocado)', () => {
    // Dos chocolates con el mismo orden (colisión) pero de slots distintos: editar/borrar uno
    // no debe emparejar (y borrar) al otro.
    const choc1: RegItem = { pkg: 'chocolate', orden: 'chocolate1', peso: 20, pickingSlotId: 11 };
    const choc2: RegItem = { pkg: 'chocolate', orden: 'chocolate1', peso: 20, pickingSlotId: 22 };
    expect(sameStableItem(choc1, choc2)).toBe(false);
    expect(sameStableItem(choc2, choc2)).toBe(true); // cada uno solo empareja consigo mismo
  });
  it('empareja por orden cuando no hay slot', () => {
    expect(sameStableItem({ orden: 'pallet2' }, { orden: 'pallet2' })).toBe(true);
    expect(sameStableItem({ orden: 'pallet2' }, { orden: 'pallet1' })).toBe(false);
  });
  it('no empareja con undefined', () => {
    expect(sameStableItem({ orden: 'pallet1' }, undefined)).toBe(false);
  });
});

describe('reconcileSavedRows — preserva filas en progreso', () => {
  it('NO toca filas no guardadas (usuario escribiendo)', () => {
    const inProgress: Row<RegItem> = { id: 'row-a', saved: false, peso: '12' };
    const rows = [inProgress];
    const items: RegItem[] = [];
    const out = reconcileSavedRows(rows, items);
    // sin cambios → misma referencia de array
    expect(out).toBe(rows);
    expect(out[0]).toBe(inProgress);
  });

  it('conserva la fila en progreso al reconciliar junto a filas guardadas', () => {
    const savedItem: RegItem = { pkg: 'pallet', orden: 'pallet1', peso: 10, pickingSlotId: 5 };
    const freshItem: RegItem = { pkg: 'pallet', orden: 'pallet2', peso: 10, pickingSlotId: 5 };
    const inProgress: Row<RegItem> = { id: 'wip', saved: false, peso: '3' };
    const savedRow: Row<RegItem> = { id: 'r5', saved: true, savedItem, pickingSlotId: 5 };
    const out = reconcileSavedRows([inProgress, savedRow], [freshItem]);
    // fila en progreso intacta
    expect(out[0]).toBe(inProgress);
    // fila guardada con savedItem refrescado al orden nuevo
    expect(out[1].savedItem).toBe(freshItem);
    expect(out[1].savedItem?.orden).toBe('pallet2');
    // id de fila preservado
    expect(out[1].id).toBe('r5');
  });
});

describe('reconcileSavedRows — refresca filas guardadas desde dispatchData nuevo', () => {
  it('refresca savedItem tras un renumber remoto (match por slot)', () => {
    const stale: RegItem = { pkg: 'pallet', orden: 'pallet1', peso: 10, pickingSlotId: 5 };
    const fresh: RegItem = { pkg: 'pallet', orden: 'pallet4', peso: 25, pickingSlotId: 5 };
    const rows: Row<RegItem>[] = [{ id: 'r', saved: true, savedItem: stale, pickingSlotId: 5 }];
    const out = reconcileSavedRows(rows, [fresh]);
    expect(out).not.toBe(rows); // hubo cambio
    expect(out[0].savedItem).toBe(fresh);
  });

  it('devuelve la MISMA referencia si nada cambió (evita re-render loop)', () => {
    const item: RegItem = { pkg: 'pallet', orden: 'pallet1', peso: 10, pickingSlotId: 5 };
    const rows: Row<RegItem>[] = [{ id: 'r', saved: true, savedItem: item, pickingSlotId: 5 }];
    const out = reconcileSavedRows(rows, [item]);
    expect(out).toBe(rows);
  });

  it('descarta filas guardadas cuyo item ya no existe en el contexto', () => {
    const gone: RegItem = { pkg: 'box', orden: 'bulto1', peso: 4, pickingSlotId: 9 };
    const stays: RegItem = { pkg: 'pallet', orden: 'pallet1', peso: 10, pickingSlotId: 5 };
    const rows: Row<RegItem>[] = [
      { id: 'r-gone', saved: true, savedItem: gone, pickingSlotId: 9 },
      { id: 'r-stay', saved: true, savedItem: stays, pickingSlotId: 5 },
    ];
    const out = reconcileSavedRows(rows, [stays]); // 'gone' ya no está
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r-stay');
  });

  it('conserva fila guardada sin clave estable (no pierde datos)', () => {
    const noKey = { peso: 5 } as unknown as RegItem; // sin slot/id/orden
    const rows: Row<RegItem>[] = [{ id: 'r', saved: true, savedItem: noKey }];
    const out = reconcileSavedRows(rows, [] as RegItem[]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('r');
  });

  it('Santiago: refresca por id aunque orden cambie', () => {
    const stale: SantItem = { id: 'CDMTG-1', orden: 'P1', peso: 10 };
    const fresh: SantItem = { id: 'CDMTG-1', orden: 'P3', peso: 30 };
    const rows: Row<SantItem>[] = [{ id: 'row', saved: true, savedItem: stale }];
    const out = reconcileSavedRows(rows, [fresh]);
    expect(out[0].savedItem).toBe(fresh);
    expect(out[0].savedItem?.orden).toBe('P3');
  });
});

describe('findItemForRow — encuentra el pallet correcto tras un renumber', () => {
  it('Regiones: encuentra el pallet destino por slot aunque el orden se haya movido', () => {
    // El usuario ya reconcilió (savedItem fresco). El contexto renumeró pallet1→pallet3.
    const freshSaved: RegItem = { pkg: 'pallet', orden: 'pallet3', peso: 10, pickingSlotId: 5 };
    const ctx: RegItem[] = [
      { pkg: 'pallet', orden: 'pallet1', peso: 1, pickingSlotId: 2 },
      { pkg: 'pallet', orden: 'pallet2', peso: 2, pickingSlotId: 3 },
      { pkg: 'pallet', orden: 'pallet3', peso: 10, pickingSlotId: 5 },
    ];
    const found = findItemForRow(ctx, { pickingSlotId: 5, savedItem: freshSaved });
    expect(found?.pickingSlotId).toBe(5);
    expect(found?.orden).toBe('pallet3');
  });

  it('Regiones manual (sin slot): empareja por orden ya reconciliado', () => {
    const freshSaved: RegItem = { pkg: 'pallet', orden: 'pallet2', peso: 10 };
    const ctx: RegItem[] = [
      { pkg: 'pallet', orden: 'pallet1', peso: 5 },
      { pkg: 'pallet', orden: 'pallet2', peso: 10 },
    ];
    const found = findItemForRow(ctx, { savedItem: freshSaved });
    expect(found?.orden).toBe('pallet2');
  });

  it('devuelve undefined si el destino ya no existe (dispara el toast, no un no-op)', () => {
    const saved: RegItem = { pkg: 'pallet', orden: 'pallet1', peso: 10, pickingSlotId: 99 };
    const ctx: RegItem[] = [{ pkg: 'pallet', orden: 'pallet1', peso: 1, pickingSlotId: 2 }];
    const found = findItemForRow(ctx, { pickingSlotId: 99, savedItem: saved });
    expect(found).toBeUndefined();
  });

  it('Santiago: encuentra por id estable tras renumber', () => {
    const saved: SantItem = { id: 'CDMTG-9', orden: 'P1', peso: 10 };
    const ctx: SantItem[] = [
      { id: 'CDMTG-8', orden: 'P1', peso: 1 },
      { id: 'CDMTG-9', orden: 'P2', peso: 10 }, // renumerado a P2
    ];
    const found = findItemForRow(ctx, { savedItem: saved });
    expect(found?.id).toBe('CDMTG-9');
    expect(found?.orden).toBe('P2');
  });
});
