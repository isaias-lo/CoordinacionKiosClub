// @vitest-environment jsdom
//
// jsdom no trae IndexedDB, y esta cola NO usa el respaldo en localStorage a propósito (las fotos
// en data URL revientan la cuota). Así que se stubea el almacén compartido: lo que se prueba acá
// es la lógica de recepción, no el almacenamiento, que tiene sus propias pruebas.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ItemCola } from '@/lib/offline/tipos';

const almacen = vi.hoisted(() => {
  const items: ItemCola<Record<string, unknown>>[] = [];
  return {
    items,
    guardar: vi.fn(async (item: ItemCola<Record<string, unknown>>) => {
      const i = items.findIndex(x => x.id === item.id);
      if (i >= 0) items[i] = item; else items.push(item);
      return true;
    }),
    listar: vi.fn(async () => [...items]),
    eliminar: vi.fn(async (id: string) => {
      const i = items.findIndex(x => x.id === id);
      if (i >= 0) items.splice(i, 1);
    }),
    contar: vi.fn(async () => items.length),
  };
});

vi.mock('@/lib/offline/almacen', () => ({
  guardar: almacen.guardar,
  listar:  almacen.listar,
  eliminar: almacen.eliminar,
  contar:  almacen.contar,
}));

import {
  encolarRecepcion,
  listarRecepcionesPendientes,
  recepcionesBloqueadas,
  drenarRecepciones,
  type CuerpoRecepcion,
} from '../colaRecepcion';

const CUERPO: CuerpoRecepcion = {
  cod: '01ABC',
  tienda: 'Tienda Centro',
  receptor: 'Juana Pérez',
  rut: '12.345.678-9',
  recibo: 'comprobante.firma',
  clientOpId: 'op-1',
};

beforeEach(() => {
  almacen.items.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('encolarRecepcion', () => {
  it('guarda el cuerpo tal cual se iba a mandar', async () => {
    expect(await encolarRecepcion(CUERPO, 'op-1')).toBe(true);
    const q = await listarRecepcionesPendientes();
    expect(q).toHaveLength(1);
    expect(q[0].payload).toEqual(CUERPO);
    expect(q[0].modulo).toBe('recepcion');
    expect(q[0].clientOpId).toBe('op-1');
  });

  it('NO pide el respaldo en localStorage: las fotos en data URL no caben', async () => {
    await encolarRecepcion(CUERPO, 'op-1');
    expect(almacen.guardar).toHaveBeenCalledWith(expect.anything(), { permiteRespaldo: false });
  });

  it('devuelve false si el almacén no pudo guardar', async () => {
    // La pantalla necesita saberlo: un "queda pendiente" sobre algo que no se guardó en ningún
    // lado sería el falso "listo" que esta pantalla evita desde siempre.
    almacen.guardar.mockResolvedValueOnce(false);
    expect(await encolarRecepcion(CUERPO, 'op-1')).toBe(false);
  });
});

describe('drenarRecepciones', () => {
  it('no hace nada sin pendientes', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await drenarRecepciones()).toEqual({ enviadas: 0, bloqueadas: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('manda el cuerpo guardado a /api/recepcion y lo saca de la cola', async () => {
    await encolarRecepcion(CUERPO, 'op-1');
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await drenarRecepciones()).toEqual({ enviadas: 1, bloqueadas: 0 });
    expect(fetchMock).toHaveBeenCalledWith('/api/recepcion', expect.objectContaining({ method: 'POST' }));
    const enviado = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(enviado).toEqual(CUERPO);
    expect(await listarRecepcionesPendientes()).toEqual([]);
  });

  it('conserva lo que falló sin señal', async () => {
    await encolarRecepcion(CUERPO, 'op-1');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));

    expect(await drenarRecepciones()).toEqual({ enviadas: 0, bloqueadas: 0 });
    const q = await listarRecepcionesPendientes();
    expect(q).toHaveLength(1);
    expect(q[0].intentos).toBe(1);
    expect(q[0].bloqueado).toBeUndefined();
  });

  it('conserva lo que falló por un servidor caído', async () => {
    await encolarRecepcion(CUERPO, 'op-1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));

    await drenarRecepciones();
    expect((await listarRecepcionesPendientes())[0].bloqueado).toBeUndefined();
  });

  it('marca como bloqueado un comprobante vencido o inválido', async () => {
    // 401 es lo que devuelve /api/recepcion cuando la prueba del OTP ya no vale. Reintentarlo
    // para siempre dejaría a la tienda creyendo que se va a enviar solo, y nunca pasaría.
    await encolarRecepcion(CUERPO, 'op-1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));

    expect(await drenarRecepciones()).toEqual({ enviadas: 0, bloqueadas: 1 });
    expect(await recepcionesBloqueadas()).toHaveLength(1);
  });

  it('no reintenta lo ya bloqueado', async () => {
    await encolarRecepcion(CUERPO, 'op-1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await drenarRecepciones();

    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await drenarRecepciones();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un duplicado aceptado por el servidor sale de la cola', async () => {
    // /api/recepcion devuelve 200 con `duplicate: true` cuando el clientOpId ya se procesó: la
    // petición anterior sí había llegado y lo que se perdió fue la respuesta. Eso es éxito.
    await encolarRecepcion(CUERPO, 'op-1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200 })));

    expect(await drenarRecepciones()).toEqual({ enviadas: 1, bloqueadas: 0 });
    expect(await listarRecepcionesPendientes()).toEqual([]);
  });
});
