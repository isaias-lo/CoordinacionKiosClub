import { describe, it, expect, vi } from 'vitest';
import { drenar, type AlmacenCola } from '../drenar';
import type { ItemCola } from '../tipos';

function item(id: string, extra: Partial<ItemCola<string>> = {}): ItemCola<string> {
  return {
    id, modulo: 'picking', clientOpId: `op-${id}`, payload: id,
    intentos: 0, createdAt: Number(id), ...extra,
  };
}

function almacenFalso(): AlmacenCola<string> & { guardados: ItemCola<string>[]; borrados: string[] } {
  const guardados: ItemCola<string>[] = [];
  const borrados: string[] = [];
  return {
    guardados, borrados,
    guardar: async i => { guardados.push(i); return true; },
    eliminar: async id => { borrados.push(id); },
  };
}

describe('drenar', () => {
  it('elimina lo que se envió y conserva lo que hay que reintentar', async () => {
    const a = almacenFalso();
    const r = await drenar(
      [item('1'), item('2')],
      async i => (i.id === '1' ? { veredicto: 'ok' } : { veredicto: 'reintentar', mensaje: 'HTTP 503' }),
      a,
    );
    expect(r).toEqual({ enviados: 1, bloqueados: 0, pendientes: 1 });
    expect(a.borrados).toEqual(['1']);
    expect(a.guardados.map(i => i.id)).toEqual(['2']);
  });

  it('marca como bloqueado lo que el servidor rechaza de forma definitiva', async () => {
    const a = almacenFalso();
    const r = await drenar([item('1')], async () => ({ veredicto: 'bloqueado', mensaje: 'HTTP 403' }), a);
    expect(r.bloqueados).toBe(1);
    expect(a.borrados).toEqual([]);
    expect(a.guardados[0].bloqueado).toBe(true);
  });

  it('una excepción es falta de señal, no un rechazo: el ítem se conserva', async () => {
    // `fetch` tira cuando no hay red. Tratarlo como definitivo borraría justo el trabajo que la
    // cola existe para salvar.
    const a = almacenFalso();
    const r = await drenar([item('1')], async () => { throw new Error('Failed to fetch'); }, a);
    expect(r).toEqual({ enviados: 0, bloqueados: 0, pendientes: 1 });
    expect(a.guardados[0].bloqueado).toBeUndefined();
    expect(a.guardados[0].ultimoError).toBe('Failed to fetch');
  });

  it('no vuelve a intentar los que ya están bloqueados', async () => {
    const a = almacenFalso();
    const enviar = vi.fn(async (_i: ItemCola<string>) => ({ veredicto: 'ok' as const }));
    const r = await drenar([item('1', { bloqueado: true }), item('2')], enviar, a);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0]?.[0].id).toBe('2');
    expect(r.enviados).toBe(1);
  });

  it('envía en orden y de a uno: una impresión depende de los pallets de antes', async () => {
    const a = almacenFalso();
    const orden: string[] = [];
    let enVuelo = 0;
    await drenar([item('1'), item('2'), item('3')], async i => {
      expect(enVuelo).toBe(0); // nunca dos peticiones a la vez
      enVuelo++;
      await Promise.resolve();
      enVuelo--;
      orden.push(i.id);
      return { veredicto: 'ok' };
    }, a);
    expect(orden).toEqual(['1', '2', '3']);
  });

  it('un fallo en el medio no frena a los que siguen', async () => {
    const a = almacenFalso();
    const r = await drenar(
      [item('1'), item('2'), item('3')],
      async i => (i.id === '2' ? { veredicto: 'reintentar' } : { veredicto: 'ok' }),
      a,
    );
    expect(r.enviados).toBe(2);
    expect(a.borrados).toEqual(['1', '3']);
  });
});

describe('drenar · progreso parcial', () => {
  it('guarda el progreso que el envío alcanzó a hacer antes de fallar', async () => {
    // El conductor sube las fotos una por una y recién después manda el PATCH. Si el PATCH falla,
    // las fotos ya subidas tienen que quedar anotadas: si no, cada reintento las vuelve a subir y
    // gasta los datos del teléfono de alguien que está en ruta.
    const a = almacenFalso();
    await drenar(
      [item('1', { payload: 'sin-subir' })],
      async i => ({ veredicto: 'reintentar', mensaje: 'HTTP 503', item: { ...i, payload: 'ya-subida' } }),
      a,
    );
    expect(a.guardados[0].payload).toBe('ya-subida');
    expect(a.guardados[0].intentos).toBe(1);
  });

  it('el progreso también se conserva cuando el rechazo es definitivo', async () => {
    const a = almacenFalso();
    await drenar(
      [item('1', { payload: 'sin-subir' })],
      async i => ({ veredicto: 'bloqueado', mensaje: 'HTTP 403', item: { ...i, payload: 'ya-subida' } }),
      a,
    );
    expect(a.guardados[0].payload).toBe('ya-subida');
    expect(a.guardados[0].bloqueado).toBe(true);
  });

  it('sin progreso devuelto se usa el ítem original', async () => {
    const a = almacenFalso();
    await drenar([item('1', { payload: 'original' })], async () => ({ veredicto: 'reintentar' }), a);
    expect(a.guardados[0].payload).toBe('original');
  });
});
