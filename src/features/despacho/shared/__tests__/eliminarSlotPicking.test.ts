import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// El módulo importa el cliente supabase al cargar; lo mockeamos para no inicializarlo en tests.
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ delete: () => ({ eq: () => ({ then: () => {} }) }) }) },
}));

const logActividad = vi.fn();
vi.mock('@/lib/actividad', () => ({ logActividad: (...a: unknown[]) => logActividad(...a) }));

import { marcarRecienBorrado, fueRecienBorrado, eliminarSlotPicking } from '../eliminarSlotPicking';
import { tieneLapida, _limpiarLapidas } from '../lapidasBorrado';

describe('registro "recién borrado" (RC-3: guard anti-revive)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('un id marcado queda "recién borrado" y expira solo tras el TTL', () => {
    expect(fueRecienBorrado(101)).toBe(false);
    marcarRecienBorrado(101);
    expect(fueRecienBorrado(101)).toBe(true);
    vi.advanceTimersByTime(4999);
    expect(fueRecienBorrado(101)).toBe(true);  // sigue dentro de la ventana de propagación
    vi.advanceTimersByTime(2);
    expect(fueRecienBorrado(101)).toBe(false); // ya expiró (TTL 5000 ms)
  });

  it('marca ids independientes', () => {
    marcarRecienBorrado(1);
    marcarRecienBorrado(2);
    expect(fueRecienBorrado(1)).toBe(true);
    expect(fueRecienBorrado(2)).toBe(true);
    expect(fueRecienBorrado(3)).toBe(false);
    vi.advanceTimersByTime(5001);
    expect(fueRecienBorrado(1)).toBe(false);
    expect(fueRecienBorrado(2)).toBe(false);
  });
});


// ── El hueco que dejó desaparecer cinco unidades de 16PQA sin rastro (30/09/2026) ──────────────
//
// Ese día el sistema entero borró 8 unidades y la pantalla Actividad mostró 1. El borrado del slot
// era incondicional; el registro en la bitácora vivía en los llamadores, y de los caminos que
// borran, la mayoría no lo escribía.

describe('la bitácora del borrado — se escribe en el punto ÚNICO', () => {
  beforeEach(() => { logActividad.mockClear(); _limpiarLapidas(); });

  const ctx = { fuente: 'rmcosta' as const, tiendaCod: '16PQA', tiendaNombre: 'PARQUE ARAUCO', label: 'CH1' };

  it('un borrado cualquiera queda registrado, con su tienda y su número', () => {
    eliminarSlotPicking(514, ctx);
    expect(logActividad).toHaveBeenCalledTimes(1);
    expect(logActividad).toHaveBeenCalledWith({
      accion: 'eliminar_item', fuente: 'rmcosta',
      tiendaCod: '16PQA', tiendaNombre: 'PARQUE ARAUCO', label: 'CH1', slotId: 514,
    });
  });

  it('el de una tarjeta SIN pesar también — esa unidad ya tiene etiqueta impresa', () => {
    eliminarSlotPicking(526, { fuente: 'nacional', tiendaCod: '30PHU', label: 'P7' });
    expect(logActividad).toHaveBeenCalledTimes(1);
  });

  it('unificar y sumar NO escriben un segundo evento', () => {
    // Ya registran su propia acción. Un `eliminar_item` encima contaría el mismo borrado dos veces
    // y torcería las mediciones que leen esa acción.
    eliminarSlotPicking(514, { ...ctx, yaRegistrado: true });
    expect(logActividad).not.toHaveBeenCalled();
  });

  it('sin slot no pasa nada: ni borrado, ni lápida, ni evento', () => {
    eliminarSlotPicking(undefined, ctx);
    eliminarSlotPicking(null, ctx);
    eliminarSlotPicking(0, ctx);
    expect(logActividad).not.toHaveBeenCalled();
  });

  it('registrar no reemplaza a los dos guards: la lápida y el anti-revive siguen', () => {
    eliminarSlotPicking(777, ctx);
    expect(fueRecienBorrado(777)).toBe(true);
    expect(tieneLapida('slot:777')).toBe(true);
  });

  it('también cuando el borrado ya se registra con otra acción', () => {
    eliminarSlotPicking(888, { ...ctx, yaRegistrado: true });
    expect(fueRecienBorrado(888)).toBe(true);
    expect(tieneLapida('slot:888')).toBe(true);
  });
});
