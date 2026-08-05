import { describe, it, expect } from 'vitest';
import { shouldSyncTab } from '../autoSync';

describe('shouldSyncTab', () => {
  it('sincroniza pestañas de despacho (rm/regiones) al abrir si aún no se sincronizó', () => {
    expect(shouldSyncTab('rm', false)).toBe(true);
    expect(shouldSyncTab('regiones', false)).toBe(true);
  });

  it('NO sincroniza recepción (viene del flujo de tienda, no del Sheet de despacho)', () => {
    expect(shouldSyncTab('recepcion', false)).toBe(false);
  });

  it('NO sincroniza historial (no es tabla sincronizable)', () => {
    expect(shouldSyncTab('historial', false)).toBe(false);
  });

  it('no re-sincroniza si ya se sincronizó esta sesión (evita spam en cada cambio de pestaña)', () => {
    expect(shouldSyncTab('rm', true)).toBe(false);
    expect(shouldSyncTab('regiones', true)).toBe(false);
  });

  it('regresión: sincroniza aunque la tabla NO esté vacía (antes solo si loaded.length===0)', () => {
    // El bug era que solo sincronizaba con tabla vacía; ahora la decisión no depende de la
    // cantidad de filas cargadas, solo de la pestaña y de si ya se sincronizó.
    expect(shouldSyncTab('rm', false)).toBe(true);
  });
});
