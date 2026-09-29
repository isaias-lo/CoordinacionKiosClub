import { describe, it, expect } from 'vitest';
import { clasificarEstado, siguienteEstado, pendientesDeEnvio, bloqueados } from '../resultado';
import type { ItemCola } from '../tipos';

function item(extra: Partial<ItemCola<string>> = {}): ItemCola<string> {
  return {
    id: 'a', modulo: 'picking', clientOpId: 'op-1', payload: 'x',
    intentos: 0, createdAt: 1, ...extra,
  };
}

describe('clasificarEstado', () => {
  it('2xx es ok', () => {
    for (const s of [200, 201, 204, 299]) expect(clasificarEstado(s)).toBe('ok');
  });

  it('4xx es definitivo: reintentarlo solo repite el mismo rechazo', () => {
    for (const s of [400, 401, 403, 404, 409, 422]) expect(clasificarEstado(s)).toBe('bloqueado');
  });

  it('408, 425 y 429 se reintentan aunque sean 4xx', () => {
    // No dicen "esto está mal", dicen "ahora no". Tratarlos como definitivos le borraría el
    // trabajo a alguien por un pico de tráfico.
    for (const s of [408, 425, 429]) expect(clasificarEstado(s)).toBe('reintentar');
  });

  it('5xx se reintenta: el problema no es de quien registró', () => {
    for (const s of [500, 502, 503, 504]) expect(clasificarEstado(s)).toBe('reintentar');
  });

  it('un código fuera de rango se reintenta, nunca se descarta', () => {
    expect(clasificarEstado(0)).toBe('reintentar');
    expect(clasificarEstado(302)).toBe('reintentar');
  });
});

describe('siguienteEstado', () => {
  it('ok elimina el ítem', () => {
    expect(siguienteEstado(item(), 'ok')).toEqual({ tipo: 'eliminar' });
  });

  it('reintentar lo guarda con un intento más y sin bloquear', () => {
    const a = siguienteEstado(item({ intentos: 2 }), 'reintentar', 'HTTP 503');
    expect(a.tipo).toBe('guardar');
    if (a.tipo !== 'guardar') return;
    expect(a.item.intentos).toBe(3);
    expect(a.item.ultimoError).toBe('HTTP 503');
    expect(a.item.bloqueado).toBeUndefined();
  });

  it('bloqueado lo marca, que es lo que lo hace visible', () => {
    const a = siguienteEstado(item(), 'bloqueado', 'HTTP 403');
    expect(a.tipo).toBe('guardar');
    if (a.tipo !== 'guardar') return;
    expect(a.item.bloqueado).toBe(true);
    expect(a.item.ultimoError).toBe('HTTP 403');
  });

  it('un reintento posterior no desmarca uno ya bloqueado', () => {
    const a = siguienteEstado(item({ bloqueado: true }), 'reintentar');
    expect(a.tipo).toBe('guardar');
    if (a.tipo !== 'guardar') return;
    expect(a.item.bloqueado).toBe(true);
  });

  it('no muta el ítem original', () => {
    const original = item();
    siguienteEstado(original, 'bloqueado', 'HTTP 400');
    expect(original.intentos).toBe(0);
    expect(original.bloqueado).toBeUndefined();
  });
});

describe('pendientesDeEnvio / bloqueados', () => {
  const lista = [item({ id: '1' }), item({ id: '2', bloqueado: true }), item({ id: '3' })];

  it('separa los que todavía se intentan de los que ya no', () => {
    expect(pendientesDeEnvio(lista).map(i => i.id)).toEqual(['1', '3']);
    expect(bloqueados(lista).map(i => i.id)).toEqual(['2']);
  });
});
