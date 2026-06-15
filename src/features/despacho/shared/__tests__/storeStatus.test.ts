import { describe, it, expect } from 'vitest';
import { computeStoreStatus } from '../storeStatus';

describe('computeStoreStatus', () => {
  it('sin operaciones → none (gris)', () => {
    expect(computeStoreStatus(0, 0)).toBe('none');
  });

  it('operaciones creadas pero nada terminado → none (gris, no naranja)', () => {
    expect(computeStoreStatus(4, 0)).toBe('none');
    expect(computeStoreStatus(1, 0)).toBe('none');
  });

  it('algunas terminadas pero no todas → partial (naranja)', () => {
    expect(computeStoreStatus(4, 1)).toBe('partial');
    expect(computeStoreStatus(4, 3)).toBe('partial');
  });

  it('todas terminadas → complete (verde)', () => {
    expect(computeStoreStatus(4, 4)).toBe('complete');
    expect(computeStoreStatus(1, 1)).toBe('complete');
  });

  it('done > total (defensivo) → complete', () => {
    expect(computeStoreStatus(4, 5)).toBe('complete');
  });

  it('valores negativos (defensivo) → none', () => {
    expect(computeStoreStatus(-1, -1)).toBe('none');
    expect(computeStoreStatus(3, -2)).toBe('none');
  });
});
