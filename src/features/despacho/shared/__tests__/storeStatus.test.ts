import { describe, it, expect } from 'vitest';
import { computeStoreStatus } from '../storeStatus';

describe('computeStoreStatus', () => {
  it('sin operaciones asignadas → none (gris)', () => {
    expect(computeStoreStatus(0, 0)).toBe('none');
  });

  it('asignado pero nada terminado (0/N) → partial (naranja)', () => {
    expect(computeStoreStatus(4, 0)).toBe('partial');
    expect(computeStoreStatus(1, 0)).toBe('partial');
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

  it('sin total → none; con total y done negativo → partial (defensivo)', () => {
    expect(computeStoreStatus(-1, -1)).toBe('none');
    expect(computeStoreStatus(3, -2)).toBe('partial');
  });
});
