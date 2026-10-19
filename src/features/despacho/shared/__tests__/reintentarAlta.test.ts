import { describe, it, expect, vi } from 'vitest';
import { conReintentos, valeReintentar } from '../reintentarAlta';

const sinEspera = () => Promise.resolve();

describe('valeReintentar', () => {
  it('sin respuesta o con el servidor caído, sí', () => {
    expect(valeReintentar(null)).toBe(true);
    expect(valeReintentar(500)).toBe(true);
    expect(valeReintentar(503)).toBe(true);
  });
  it('con una respuesta del servidor, no', () => {
    expect(valeReintentar(200)).toBe(false);
    expect(valeReintentar(400)).toBe(false);
    expect(valeReintentar(401)).toBe(false);
  });
});

describe('conReintentos', () => {
  it('no repite lo que salió bien', async () => {
    const intento = vi.fn(async () => ({ status: 200 }));
    expect(await conReintentos(intento, [1, 1], sinEspera)).toEqual({ status: 200 });
    expect(intento).toHaveBeenCalledTimes(1);
  });

  it('repite tras perder la respuesta y se queda con la que llega', async () => {
    // El caso del wifi malo: la primera llegó al servidor pero la respuesta se perdió.
    const respuestas = [{ status: null }, { status: 200 }];
    const intento = vi.fn(async () => respuestas.shift()!);
    expect(await conReintentos(intento, [1, 1], sinEspera)).toEqual({ status: 200 });
    expect(intento).toHaveBeenCalledTimes(2);
  });

  it('no repite un rechazo del servidor', async () => {
    const intento = vi.fn(async () => ({ status: 400 }));
    await conReintentos(intento, [1, 1], sinEspera);
    expect(intento).toHaveBeenCalledTimes(1);
  });

  it('se rinde cuando se acaban las esperas y devuelve el último resultado', async () => {
    const intento = vi.fn(async () => ({ status: null }));
    const dormir = vi.fn(sinEspera);
    expect(await conReintentos(intento, [5, 7], dormir)).toEqual({ status: null });
    expect(intento).toHaveBeenCalledTimes(3);
    expect(dormir.mock.calls.map((c: unknown[]) => c[0])).toEqual([5, 7]);
  });
});
