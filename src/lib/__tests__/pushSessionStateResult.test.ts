import { describe, it, expect, vi, beforeEach } from 'vitest';

// El cliente de Supabase se mockea al nivel del import (política del proyecto).
const upsertMock = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { from: () => ({ upsert: upsertMock }) },
}));

import { pushSessionStateResult, pushSessionState } from '../userSessionState';

const responder = (r: { data?: unknown; error?: unknown }) => {
  upsertMock.mockReturnValue({ select: () => ({ maybeSingle: () => Promise.resolve(r) }) });
};

beforeEach(() => { upsertMock.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('pushSessionStateResult — distinguir "falló" de "se guardó"', () => {
  it('guardado correcto → ok:true con la marca del servidor', async () => {
    responder({ data: { updated_at: '2026-09-03T12:00:00Z' } });
    const r = await pushSessionStateResult('rutas', { AB1: [] }, 'u1', '2026-09-03');
    expect(r.ok).toBe(true);
    expect(r.updatedAt).toBe(new Date('2026-09-03T12:00:00Z').getTime());
  });

  // El caso que importa: antes esto y el error de abajo devolvían lo MISMO (null), así que quien
  // llamaba no podía saber si el tablero había llegado a la base.
  it('guardado correcto SIN marca de tiempo → sigue siendo ok:true', async () => {
    responder({ data: null });
    const r = await pushSessionStateResult('rutas', {}, 'u1', '2026-09-03');
    expect(r.ok).toBe(true);
    expect(r.updatedAt).toBeNull();
  });

  it('error de la base → ok:false', async () => {
    responder({ error: { message: 'JWT expired', details: '' } });
    const r = await pushSessionStateResult('rutas', {}, 'u1', '2026-09-03');
    expect(r.ok).toBe(false);
    expect(r.updatedAt).toBeNull();
  });

  it('un token vencido NO se puede confundir con un guardado bueno', async () => {
    responder({ error: { message: 'JWT expired', details: '' } });
    const fallo = await pushSessionStateResult('rutas', {}, 'u1', '2026-09-03');
    responder({ data: null });
    const exito = await pushSessionStateResult('rutas', {}, 'u1', '2026-09-03');
    expect(fallo.updatedAt).toBe(exito.updatedAt);   // ambos null…
    expect(fallo.ok).not.toBe(exito.ok);             // …pero distinguibles
  });

  it('escribe la fecha que se le pasa, no la de hoy', async () => {
    responder({ data: { updated_at: '2026-09-03T12:00:00Z' } });
    await pushSessionStateResult('rutas', { X: [] }, 'u1', '2026-08-30');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ fecha: '2026-08-30', fuente: 'rutas' }),
      expect.objectContaining({ onConflict: 'fecha,fuente' }),
    );
  });
});

describe('pushSessionState — compatible con quienes ya lo usan', () => {
  it('devuelve la marca de tiempo si se guardó', async () => {
    responder({ data: { updated_at: '2026-09-03T12:00:00Z' } });
    expect(await pushSessionState('rutas', {}, 'u1', '2026-09-03'))
      .toBe(new Date('2026-09-03T12:00:00Z').getTime());
  });
  it('devuelve null si falló', async () => {
    responder({ error: { message: 'boom', details: '' } });
    expect(await pushSessionState('rutas', {}, 'u1', '2026-09-03')).toBeNull();
  });
});
