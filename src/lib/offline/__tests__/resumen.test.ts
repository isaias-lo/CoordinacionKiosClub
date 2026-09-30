import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ItemCola } from '../tipos';

const almacen = vi.hoisted(() => ({
  items: [] as ItemCola<unknown>[],
  listarTodos: vi.fn(),
}));

vi.mock('../almacen', () => ({
  listarTodos: almacen.listarTodos.mockImplementation(async () => [...almacen.items]),
}));

import { resumenOffline } from '../resumen';

function item(modulo: 'picking' | 'conductor' | 'recepcion', bloqueado = false): ItemCola<string> {
  return { id: `${modulo}-${Math.random()}`, modulo, clientOpId: 'op', payload: 'x',
           intentos: 0, createdAt: 1, ...(bloqueado ? { bloqueado: true } : {}) };
}

beforeEach(() => { almacen.items.length = 0; almacen.listarTodos.mockClear(); });

describe('resumenOffline', () => {
  it('sin nada en la cola devuelve cero', async () => {
    expect(await resumenOffline()).toEqual({ pendientes: 0, bloqueadas: 0 });
  });

  it('suma los tres módulos, no solo el de la pantalla que se está mirando', async () => {
    almacen.items.push(item('picking'), item('conductor'), item('conductor'), item('recepcion'));
    expect(await resumenOffline()).toEqual({ pendientes: 4, bloqueadas: 0 });
  });

  it('separa lo bloqueado de lo que todavía se va a intentar', async () => {
    // Son dos cosas distintas para quien mira la barra: una se está yendo sola, la otra pide que
    // alguien vuelva a registrarla.
    almacen.items.push(item('picking'), item('conductor', true), item('recepcion', true));
    expect(await resumenOffline()).toEqual({ pendientes: 1, bloqueadas: 2 });
  });

  it('cuenta un módulo que todavía no encola sin tener que tocar nada', async () => {
    almacen.items.push(item('recepcion'));
    expect((await resumenOffline()).pendientes).toBe(1);
  });

  // Esto corre cada 15 segundos en todas las pantallas, y en recepción el payload son hasta ocho
  // fotos en data URL. Una lectura por módulo traía esos MB tres veces para contarlos.
  it('lee la cola una sola vez, no una por módulo', async () => {
    almacen.items.push(item('picking'), item('conductor'), item('recepcion'));
    await resumenOffline();
    expect(almacen.listarTodos).toHaveBeenCalledTimes(1);
  });
});
