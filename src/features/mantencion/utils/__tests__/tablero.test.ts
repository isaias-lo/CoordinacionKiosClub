import { describe, it, expect } from 'vitest';
import {
  CONFIG_POR_DEFECTO, contadoresDelTablero, diasDesde, duplicadosPendientes, esSinProgramar,
  esTrabajoAbierto, fichasDelTablero, sinClasificar, textoAlerta,
} from '../tablero';
import type { SolicitudMant, TiendaMant } from '../../tipos';

let n = 0;
const sol = (p: Partial<SolicitudMant> = {}): SolicitudMant => ({
  id: `s${++n}`, codigoTienda: '26ALC', nombreTienda: 'Alcántara', categoria: null, descripcion: 'd',
  urgencia: null, estado: 'pendiente', origen: 'app', duplicadaDe: null, esperaMaterial: false,
  creadaPorNombre: null, creadaEn: '2026-11-21T13:00:00Z', fotos: [], comentarios: [], ...p,
});
const tiendas: TiendaMant[] = [
  { codigo: '26ALC', nombre: 'Alcántara', zona: 'RM' },
  { codigo: '31TLC', nombre: 'Talca', zona: 'Ruta Sur' },
];
const ahora = new Date('2026-11-21T15:00:00Z');

describe('esTrabajoAbierto / esSinProgramar', () => {
  it('cerrada, descartada o unida no es trabajo abierto', () => {
    expect(esTrabajoAbierto(sol())).toBe(true);
    expect(esTrabajoAbierto(sol({ estado: 'cerrada' }))).toBe(false);
    expect(esTrabajoAbierto(sol({ estado: 'descartada' }))).toBe(false);
    expect(esTrabajoAbierto(sol({ duplicadaDe: 'x' }))).toBe(false);
  });

  it('pendiente y no_resuelta están sin programar; programada no', () => {
    expect(esSinProgramar(sol())).toBe(true);
    expect(esSinProgramar(sol({ estado: 'no_resuelta' }))).toBe(true);
    expect(esSinProgramar(sol({ estado: 'programada' }))).toBe(false);
  });
});

describe('duplicadosPendientes', () => {
  const a = sol({ id: 'a', categoria: 'Eléctrico', creadaEn: '2026-11-10T10:00:00Z' });
  const b = sol({ id: 'b', categoria: 'eléctrico', creadaEn: '2026-11-20T10:00:00Z' });

  it('misma tienda y categoría: la más vieja es la original', () => {
    const [p] = duplicadosPendientes([b, a]);
    expect([p.original.id, p.posible.id]).toEqual(['a', 'b']);
  });

  it('un par marcado «no es duplicado» no vuelve', () => {
    expect(duplicadosPendientes([a, b], [{ originalId: 'a', posibleId: 'b' }])).toEqual([]);
  });

  it('una ya unida no forma par', () => {
    expect(duplicadosPendientes([a, { ...b, duplicadaDe: 'a', estado: 'descartada' }])).toEqual([]);
  });
});

describe('sinClasificar', () => {
  it('solo pendientes sin urgencia, de la más vieja a la más nueva', () => {
    const vieja = sol({ creadaEn: '2026-11-01T10:00:00Z' });
    const nueva = sol({ creadaEn: '2026-11-20T10:00:00Z' });
    const lista = [nueva, sol({ urgencia: 'leve' }), vieja, sol({ estado: 'descartada' })];
    expect(sinClasificar(lista, []).map(s => s.id)).toEqual([vieja.id, nueva.id]);
  });

  it('la que espera decisión de duplicado no aparece dos veces', () => {
    const a = sol({ id: 'a2', categoria: 'Gas', creadaEn: '2026-11-10T10:00:00Z', urgencia: 'media' });
    const b = sol({ id: 'b2', categoria: 'Gas' });
    const pend = duplicadosPendientes([a, b]);
    expect(sinClasificar([a, b], pend)).toEqual([]);
  });
});

describe('diasDesde', () => {
  it('cuenta días de Chile', () => {
    expect(diasDesde('2026-11-21T04:00:00Z', ahora)).toBe(0);
    expect(diasDesde('2026-11-21T02:00:00Z', ahora)).toBe(1);
    expect(diasDesde('2026-11-09T15:00:00Z', ahora)).toBe(12);
  });
});

describe('fichasDelTablero', () => {
  it('el ejemplo del plan: 7 sin programar, 1 urgente, 12 días → 18 puntos', () => {
    const lista = [
      sol({ urgencia: 'urgente', creadaEn: '2026-11-09T15:00:00Z' }),
      ...Array.from({ length: 6 }, () => sol({ urgencia: 'leve' })),
    ];
    const [f] = fichasDelTablero(lista, tiendas, CONFIG_POR_DEFECTO, [], ahora);
    expect(f).toMatchObject({ codigoTienda: '26ALC', abiertas: 7, sinProgramar: 7, urgentes: 1, diasMasAntigua: 12, puntaje: 18 });
    expect(f.nivel).toBe('roja');
  });

  it('las tiendas sin nada abierto no aparecen', () => {
    const f = fichasDelTablero([sol({ estado: 'cerrada' })], tiendas, CONFIG_POR_DEFECTO, [], ahora);
    expect(f).toEqual([]);
  });

  it('ordena por puntaje: la tienda con una urgente va primero', () => {
    const lista = [sol({ codigoTienda: '31TLC' }), sol({ codigoTienda: '31TLC' }), sol({ urgencia: 'urgente' })];
    expect(fichasDelTablero(lista, tiendas, CONFIG_POR_DEFECTO, [], ahora).map(f => f.codigoTienda)).toEqual(['26ALC', '31TLC']);
  });

  it('el posible duplicado no suma al conteo mientras no se decida, pero sí cuenta para revisar', () => {
    const a = sol({ categoria: 'Eléctrico', creadaEn: '2026-11-10T10:00:00Z', urgencia: 'media' });
    const b = sol({ categoria: 'Eléctrico' });
    const [f] = fichasDelTablero([a, b], tiendas, CONFIG_POR_DEFECTO, [], ahora);
    expect(f.abiertas).toBe(1);
    expect(f.porRevisar).toBe(1);
  });

  it('con «no es duplicado» las dos suman', () => {
    const a = sol({ id: 'x1', categoria: 'Eléctrico', creadaEn: '2026-11-10T10:00:00Z' });
    const b = sol({ id: 'x2', categoria: 'Eléctrico' });
    const [f] = fichasDelTablero([a, b], tiendas, CONFIG_POR_DEFECTO, [{ originalId: 'x1', posibleId: 'x2' }], ahora);
    expect(f.abiertas).toBe(2);
  });

  it('una tienda que no está en el catálogo igual aparece, con su código', () => {
    const [f] = fichasDelTablero([sol({ codigoTienda: '99ZZZ', nombreTienda: '99ZZZ' })], tiendas, CONFIG_POR_DEFECTO, [], ahora);
    expect(f).toMatchObject({ codigoTienda: '99ZZZ', zona: 'Sin zona' });
  });

  it('respeta los umbrales de la configuración', () => {
    const lista = Array.from({ length: 3 }, () => sol({ urgencia: 'leve' }));
    const [f] = fichasDelTablero(lista, tiendas, { ...CONFIG_POR_DEFECTO, umbralTotal: 2, umbralSinProgramar: 10 }, [], ahora);
    expect(f.nivel).toBe('ambar');
  });
});

describe('contadoresDelTablero', () => {
  it('suma abiertas, urgentes, tiendas en alerta y lo que espera revisión', () => {
    const lista = [sol({ urgencia: 'urgente' }), sol(), sol({ codigoTienda: '31TLC', urgencia: 'leve' })];
    const fichas = fichasDelTablero(lista, tiendas, CONFIG_POR_DEFECTO, [], ahora);
    expect(contadoresDelTablero(fichas, lista)).toEqual({ abiertas: 3, tiendasEnAlerta: 1, urgentes: 1, porRevisar: 1 });
  });
});

describe('textoAlerta', () => {
  it('se lee en castellano', () => {
    expect(textoAlerta({ tipo: 'urgencia', nivel: 'roja', valor: 1 })).toBe('1 urgente');
    expect(textoAlerta({ tipo: 'sin_programar', nivel: 'roja', valor: 6 })).toBe('6 sin programar');
    expect(textoAlerta({ tipo: 'antiguedad', nivel: 'ambar', valor: 9 })).toBe('la más antigua: 9 días');
  });
});
