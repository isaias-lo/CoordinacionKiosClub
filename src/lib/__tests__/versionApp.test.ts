import { describe, it, expect } from 'vitest';
import { hayVersionNueva, VERSION_DESCONOCIDA, debeMostrarAviso, POSPONER_MS } from '../versionApp';

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

describe('debeMostrarAviso — cerrar el aviso lo pospone, no lo silencia', () => {
  const T = 1_000_000;

  it('sin versión nueva no se muestra nada', () => {
    expect(debeMostrarAviso(false, 0, T)).toBe(false);
  });

  it('con versión nueva y sin posponer, se muestra', () => {
    expect(debeMostrarAviso(true, 0, T)).toBe(true);
  });

  it('recién cerrado, se oculta', () => {
    expect(debeMostrarAviso(true, T + POSPONER_MS, T)).toBe(false);
  });

  it('a los 29 minutos sigue oculto', () => {
    expect(debeMostrarAviso(true, T + POSPONER_MS, T + 29 * 60_000)).toBe(false);
  });

  it('a los 30 minutos VUELVE — es el punto de todo esto', () => {
    expect(debeMostrarAviso(true, T + POSPONER_MS, T + POSPONER_MS)).toBe(true);
  });

  it('cerrarlo muchas veces no lo silencia para siempre', () => {
    let pospuesto = 0;
    for (let i = 0; i < 5; i++) {
      const ahora = T + i * POSPONER_MS;
      expect(debeMostrarAviso(true, pospuesto, ahora)).toBe(true);   // vuelve cada vez
      pospuesto = ahora + POSPONER_MS;                                // y se vuelve a cerrar
    }
  });
});
