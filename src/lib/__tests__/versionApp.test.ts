import { describe, it, expect } from 'vitest';
import { hayVersionNueva, VERSION_DESCONOCIDA, debeMostrarAviso, POSPONER_MS,
  resumenDeVersiones, versionCorta } from '../versionApp';

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

// ── EL AVISO QUE SE QUEDÓ PEGADO ──────────────────────────────────────────────────────────────
//
// 06/10/2026: el coordinador apretó Recargar y el aviso siguió ahí. La cadena está bien construida
// —el service worker atiende `SKIP_WAITING`, las navegaciones van a la red— y no se pudo medir
// contra producción. En vez de adivinar la causa, el aviso pasa a decir qué versión tiene la
// pestaña y cuál está publicada: la próxima vez la respuesta se lee en pantalla.

describe('resumenDeVersiones', () => {
  it('dos distintas: dice cuál tiene y cuál hay', () => {
    expect(resumenDeVersiones('a1b2c3d4e5', 'f6a7b8c9d0'))
      .toBe('tienes a1b2c3d · publicada f6a7b8c');
  });

  it('IGUALES: lo levantó el service worker, no la comparación de versiones', () => {
    // Este es el caso que explicaría un Recargar que no trae nada nuevo: no hay versión nueva
    // que traer, el navegador solo dejó algo esperando.
    expect(resumenDeVersiones('a1b2c3d4e5', 'a1b2c3d4e5'))
      .toBe('misma versión (a1b2c3d) · la descargó el navegador');
  });

  it('sin la publicada todavía no se dibuja: media verdad no diagnostica nada', () => {
    expect(resumenDeVersiones('a1b2c3d4e5', null)).toBeNull();
    expect(resumenDeVersiones('a1b2c3d4e5', undefined)).toBeNull();
    expect(resumenDeVersiones(null, 'f6a7b8c9d0')).toBeNull();
    expect(resumenDeVersiones(undefined, undefined)).toBeNull();
  });
});

describe('versionCorta', () => {
  it('los primeros 7, como se nombra un commit en todos lados', () => {
    expect(versionCorta('fb90108f65ddb43812a043a29dfbb0043c9d2eeb')).toBe('fb90108');
  });

  it('un valor corto se devuelve entero', () => {
    expect(versionCorta('dev')).toBe('dev');
  });

  it('sin dato, una raya', () => {
    expect(versionCorta('')).toBe('—');
    expect(versionCorta(null)).toBe('—');
    expect(versionCorta(undefined)).toBe('—');
  });
});
