import { describe, it, expect } from 'vitest';
import { computeStoreStatus, progressTone } from '../storeStatus';

describe('computeStoreStatus', () => {
  it('sin operaciones → none (gris)', () => {
    expect(computeStoreStatus(0, 0)).toBe('none');
  });

  it('asignado pero 0 realizado (0/N) → none (gris, no naranja)', () => {
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

  it('valores con done <= 0 → none (defensivo)', () => {
    expect(computeStoreStatus(-1, -1)).toBe('none');
    expect(computeStoreStatus(3, -2)).toBe('none');
  });
});

describe('progressTone (semáforo real de la barra)', () => {
  it('sin operaciones (total 0) → none (no se muestra barra)', () => {
    expect(progressTone(0, 0)).toBe('none');
    expect(progressTone(-1, 0)).toBe('none');
  });

  it('ops existen pero 0 realizadas → red', () => {
    expect(progressTone(4, 0)).toBe('red');
    expect(progressTone(1, 0)).toBe('red');
    expect(progressTone(4, -2)).toBe('red'); // defensivo
  });

  it('en progreso (1..N-1) → yellow', () => {
    expect(progressTone(4, 1)).toBe('yellow');
    expect(progressTone(4, 2)).toBe('yellow');
    expect(progressTone(4, 3)).toBe('yellow');
  });

  it('todas realizadas (N/N) → green', () => {
    expect(progressTone(4, 4)).toBe('green');
    expect(progressTone(1, 1)).toBe('green');
  });

  it('done > total (defensivo) → green', () => {
    expect(progressTone(4, 5)).toBe('green');
  });
});
