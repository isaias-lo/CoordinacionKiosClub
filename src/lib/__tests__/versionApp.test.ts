import { describe, it, expect } from 'vitest';
import { hayVersionNueva, VERSION_DESCONOCIDA } from '../versionApp';

describe('hayVersionNueva', () => {
  it('avisa cuando el servidor publicó otro commit', () => {
    expect(hayVersionNueva('abc123', 'def456')).toBe(true);
  });

  it('no avisa cuando es el mismo commit', () => {
    expect(hayVersionNueva('abc123', 'abc123')).toBe(false);
  });

  it('no avisa en desarrollo', () => {
    expect(hayVersionNueva(VERSION_DESCONOCIDA, 'abc123')).toBe(false);
    expect(hayVersionNueva('abc123', VERSION_DESCONOCIDA)).toBe(false);
  });

  it('no avisa si falta alguna de las dos', () => {
    expect(hayVersionNueva(undefined, 'abc123')).toBe(false);
    expect(hayVersionNueva('abc123', undefined)).toBe(false);
    expect(hayVersionNueva('', '')).toBe(false);
    expect(hayVersionNueva('abc123', null)).toBe(false);
  });
});
