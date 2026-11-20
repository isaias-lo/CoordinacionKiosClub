import { describe, it, expect } from 'vitest';
import { normalizarCategoria, posiblesDuplicados, tieneDuplicado } from '../duplicados';
import type { SolicitudComparable } from '../duplicados';

const s = (id: string, codigoTienda: string, categoria: string | null, creadaEn: string)
  : SolicitudComparable => ({ id, codigoTienda, categoria, creadaEn });

describe('normalizarCategoria', () => {
  it('iguala acentos, mayúsculas y espacios al borde', () => {
    expect(normalizarCategoria('Eléctrico')).toBe('ELECTRICO');
    expect(normalizarCategoria('  electrico ')).toBe('ELECTRICO');
    expect(normalizarCategoria('ELÉCTRICO')).toBe('ELECTRICO');
  });

  it('vacío, nulo e indefinido dan vacío', () => {
    expect(normalizarCategoria('')).toBe('');
    expect(normalizarCategoria(null)).toBe('');
    expect(normalizarCategoria(undefined)).toBe('');
  });
});

describe('posiblesDuplicados', () => {
  it('misma tienda y misma categoría salen emparejadas', () => {
    const pares = posiblesDuplicados([
      s('a', '53VAL', 'Eléctrico', '2026-11-10'),
      s('b', '53VAL', 'eléctrico', '2026-11-18'),
    ]);
    expect(pares).toHaveLength(1);
    expect(pares[0].original.id).toBe('a');   // la más antigua
    expect(pares[0].posible.id).toBe('b');
  });

  it('distinta tienda no es duplicado aunque la categoría sea la misma', () => {
    expect(posiblesDuplicados([
      s('a', '53VAL', 'Gasfitería', '2026-11-10'),
      s('b', '09LEO', 'Gasfitería', '2026-11-18'),
    ])).toEqual([]);
  });

  it('distinta categoría en la misma tienda tampoco', () => {
    expect(posiblesDuplicados([
      s('a', '53VAL', 'Eléctrico', '2026-11-10'),
      s('b', '53VAL', 'Mobiliario', '2026-11-18'),
    ])).toEqual([]);
  });

  it('sin categoría NO se marca, aunque sean de la misma tienda', () => {
    // Dos solicitudes sin categoría solo comparten la tienda: emparejarlas llenaría «Por
    // revisar» de parejas falsas el primer día que alguien ingrese cinco cosas sin clasificar.
    expect(posiblesDuplicados([
      s('a', '53VAL', null, '2026-11-10'),
      s('b', '53VAL', '', '2026-11-18'),
      s('c', '53VAL', '   ', '2026-11-19'),
    ])).toEqual([]);
  });

  it('tres iguales dan dos parejas, las dos contra la más antigua', () => {
    const pares = posiblesDuplicados([
      s('b', '53VAL', 'Eléctrico', '2026-11-18'),
      s('a', '53VAL', 'Eléctrico', '2026-11-10'),
      s('c', '53VAL', 'Eléctrico', '2026-11-19'),
    ]);
    expect(pares).toHaveLength(2);
    expect(pares.every(p => p.original.id === 'a')).toBe(true);
    expect(pares.map(p => p.posible.id).sort()).toEqual(['b', 'c']);
  });

  it('el código de tienda se compara sin mayúsculas ni espacios', () => {
    expect(posiblesDuplicados([
      s('a', '53val ', 'Eléctrico', '2026-11-10'),
      s('b', '53VAL', 'Eléctrico', '2026-11-18'),
    ])).toHaveLength(1);
  });

  it('una sola solicitud no se empareja consigo misma', () => {
    expect(posiblesDuplicados([s('a', '53VAL', 'Eléctrico', '2026-11-10')])).toEqual([]);
  });

  it('sin solicitudes devuelve una lista vacía', () => {
    expect(posiblesDuplicados([])).toEqual([]);
  });
});

describe('tieneDuplicado', () => {
  const abiertas = [
    s('a', '53VAL', 'Eléctrico', '2026-11-10'),
    s('b', '09LEO', 'Eléctrico', '2026-11-18'),
  ];

  it('avisa antes de enviar una que se parece a otra abierta', () => {
    expect(tieneDuplicado(s('nueva', '53VAL', 'eléctrico', '2026-11-19'), abiertas)).toBe(true);
  });

  it('no se marca a sí misma', () => {
    expect(tieneDuplicado(abiertas[0], abiertas)).toBe(false);
  });

  it('sin categoría nunca avisa', () => {
    expect(tieneDuplicado(s('nueva', '53VAL', null, '2026-11-19'), abiertas)).toBe(false);
  });
});
