import { describe, it, expect } from 'vitest';
import {
  normalizarFavoritas, crearFavorita, agregarFavorita, quitarFavorita, paradasDesdeFavorita,
  resumenFavorita, type RutaFavorita,
} from '../planFavoritas';

const dir = (id: string, label = 'Av. Vitacura 2909') => ({ id, label, gps: [-33.4, -70.6] });

function fav(over: Partial<RutaFavorita> = {}): RutaFavorita {
  return { id: 'f1', nombre: 'Oriente', paradas: ['26ALC', '32BNV'], direcciones: [], creada: 1, ...over };
}

describe('crearFavorita', () => {
  it('guarda el orden tal como se ve y solo las direcciones que usa', () => {
    const f = crearFavorita({
      id: 'f1', nombre: '  Oriente  ', orden: ['32BNV', 'DIR-2', '26ALC'],
      direcciones: [dir('DIR-1'), dir('DIR-2')], carga: 'seco', ahora: 5,
    });
    expect(f).toEqual({
      id: 'f1', nombre: 'Oriente', paradas: ['32BNV', 'DIR-2', '26ALC'],
      direcciones: [dir('DIR-2')], carga: 'seco', creada: 5,
    });
  });

  it('sin nombre o sin paradas no hay favorita', () => {
    expect(crearFavorita({ id: 'x', nombre: '  ', orden: ['26ALC'], direcciones: [], ahora: 1 })).toBeNull();
    expect(crearFavorita({ id: 'x', nombre: 'A', orden: [], direcciones: [], ahora: 1 })).toBeNull();
  });
});

describe('agregarFavorita', () => {
  it('el mismo nombre reemplaza en vez de duplicar, sin mirar mayúsculas', () => {
    const lista = [fav({ id: 'a', nombre: 'Oriente' }), fav({ id: 'b', nombre: 'Norte' })];
    const nueva = fav({ id: 'c', nombre: 'ORIENTE', paradas: ['07CCR'] });
    expect(agregarFavorita(lista, nueva).map(f => f.id)).toEqual(['c', 'b']);
  });

  it('quitar borra solo esa', () => {
    expect(quitarFavorita([fav({ id: 'a' }), fav({ id: 'b' })], 'a').map(f => f.id)).toEqual(['b']);
  });
});

describe('paradasDesdeFavorita', () => {
  it('renombra las direcciones para no chocar con las de otras rutas, y respeta el orden', () => {
    const f = fav({ paradas: ['DIR-1', '26ALC', 'DIR-2'], direcciones: [dir('DIR-1', 'A'), dir('DIR-2', 'B')] });
    const r = paradasDesdeFavorita(f, ['DIR-1']);
    expect(r.selected).toEqual(['DIR-2', '26ALC', 'DIR-3']);
    expect(r.customStops.map(d => [d.id, d.label])).toEqual([['DIR-2', 'A'], ['DIR-3', 'B']]);
  });
});

describe('normalizarFavoritas', () => {
  it('acepta la lista suelta o envuelta, y ordena la más nueva arriba', () => {
    const a = fav({ id: 'a', creada: 1 }); const b = fav({ id: 'b', nombre: 'Norte', creada: 9 });
    expect(normalizarFavoritas([a, b]).map(f => f.id)).toEqual(['b', 'a']);
    expect(normalizarFavoritas({ favoritas: [a] }).map(f => f.id)).toEqual(['a']);
  });

  it('descarta basura, ids repetidos y direcciones sin coordenadas', () => {
    const rota = { ...fav({ id: 'r', paradas: ['DIR-1', '26ALC'] }), direcciones: [{ id: 'DIR-1', label: 'x', gps: [] }] };
    const out = normalizarFavoritas([null, 'x', { id: 'v' }, fav({ id: 'a' }), fav({ id: 'a' }), rota]);
    expect(out.map(f => f.id)).toEqual(['a', 'r']);
    expect(out[1].paradas).toEqual(['26ALC']);
    expect(normalizarFavoritas(undefined)).toEqual([]);
  });
});

describe('resumenFavorita', () => {
  it('cuenta tiendas y direcciones', () => {
    expect(resumenFavorita(fav({ paradas: ['26ALC', 'DIR-1', '32BNV'] }))).toBe('2 tiendas · 1 dirección');
    expect(resumenFavorita(fav({ paradas: ['26ALC'] }))).toBe('1 tienda');
  });
});
