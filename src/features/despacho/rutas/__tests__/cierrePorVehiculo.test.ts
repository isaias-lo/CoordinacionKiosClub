import { describe, it, expect } from 'vitest';
import {
  normPatente,
  parseCerradas,
  serializeCerradas,
  mergeCerradas,
  isCerrada,
  rutasNoCerradas,
  todasCerradas,
  puedeMoverCarga,
  codsEnCerradas,
  preservarCerradas,
  type RutaLike,
} from '../utils/cierrePorVehiculo';

const ruta = (p: string, nTiendas = 1): RutaLike => ({
  v: { p },
  ts: Array.from({ length: nTiendas }, (_, i) => ({ c: `T${i}` })),
});

describe('normPatente', () => {
  it('trim + uppercase', () => {
    expect(normPatente('  ab-123  ')).toBe('AB-123');
    expect(normPatente('cd45')).toBe('CD45');
  });
  it('tolera vacío/undefined', () => {
    expect(normPatente('')).toBe('');
    expect(normPatente(undefined as unknown as string)).toBe('');
  });
});

describe('parseCerradas', () => {
  it('extrae de { patentes: [...] } normalizando', () => {
    const s = parseCerradas({ patentes: [' ab-1 ', 'CD-2'] });
    expect(s).toEqual(new Set(['AB-1', 'CD-2']));
  });
  it('extrae de un array plano', () => {
    expect(parseCerradas(['ab-1', 'ab-1'])).toEqual(new Set(['AB-1']));
  });
  it('null/forma inválida → set vacío', () => {
    expect(parseCerradas(null).size).toBe(0);
    expect(parseCerradas({}).size).toBe(0);
    expect(parseCerradas({ patentes: 'no-array' }).size).toBe(0);
    expect(parseCerradas(42).size).toBe(0);
  });
  it('descarta entradas no-string o vacías', () => {
    expect(parseCerradas({ patentes: ['AB-1', '', 5, null] })).toEqual(new Set(['AB-1']));
  });
});

describe('serializeCerradas / round-trip', () => {
  it('round-trip preserva el set', () => {
    const set = new Set(['AB-1', 'CD-2']);
    const round = parseCerradas(serializeCerradas(set));
    expect(round).toEqual(set);
  });
});

describe('mergeCerradas (cross-device)', () => {
  it('unión normalizada de local y remoto', () => {
    const merged = mergeCerradas(['ab-1'], ['CD-2', 'ab-1']);
    expect(merged).toEqual(new Set(['AB-1', 'CD-2']));
  });
  it('cerrar es monótono: no se pierde un cierre local si el remoto no lo tiene', () => {
    // eco viejo remoto sin la patente recién cerrada localmente
    const merged = mergeCerradas(['AB-1'], []);
    expect(merged.has('AB-1')).toBe(true);
  });
});

describe('isCerrada', () => {
  it('compara normalizado', () => {
    const c = new Set(['AB-1']);
    expect(isCerrada(c, ' ab-1 ')).toBe(true);
    expect(isCerrada(c, 'XX-9')).toBe(false);
  });
});

describe('rutasNoCerradas (idempotencia del registro global)', () => {
  it('el global SALTA las rutas ya cerradas individualmente', () => {
    const rutas = [ruta('AB-1'), ruta('CD-2'), ruta('EF-3')];
    const cerradas = new Set(['AB-1', 'EF-3']);
    const restantes = rutasNoCerradas(rutas, cerradas);
    expect(restantes.map(r => r.v.p)).toEqual(['CD-2']);
  });
  it('sin cerradas → devuelve todas (global registra todo)', () => {
    const rutas = [ruta('AB-1'), ruta('CD-2')];
    expect(rutasNoCerradas(rutas, new Set())).toHaveLength(2);
  });
  it('todas cerradas → global no escribe ninguna fila append-only', () => {
    const rutas = [ruta('AB-1'), ruta('CD-2')];
    expect(rutasNoCerradas(rutas, new Set(['AB-1', 'CD-2']))).toHaveLength(0);
  });
  it('comparación normalizada (patente con espacios/minúsculas)', () => {
    const rutas = [ruta('ab-1')];
    expect(rutasNoCerradas(rutas, new Set(['AB-1']))).toHaveLength(0);
  });
});

describe('todasCerradas (marca del día)', () => {
  it('cierre parcial NO marca el día', () => {
    const rutas = [ruta('AB-1'), ruta('CD-2')];
    expect(todasCerradas(rutas, new Set(['AB-1']))).toBe(false);
  });
  it('todas cerradas → marca el día', () => {
    const rutas = [ruta('AB-1'), ruta('CD-2')];
    expect(todasCerradas(rutas, new Set(['AB-1', 'CD-2']))).toBe(true);
  });
  it('sin rutas con tiendas → false (no marca)', () => {
    expect(todasCerradas([], new Set())).toBe(false);
    expect(todasCerradas([ruta('AB-1', 0)], new Set())).toBe(false);
  });
  it('ignora rutas vacías al evaluar completitud', () => {
    // ruta EF-3 sin tiendas no debe bloquear el "todas cerradas"
    const rutas = [ruta('AB-1'), ruta('CD-2'), ruta('EF-3', 0)];
    expect(todasCerradas(rutas, new Set(['AB-1', 'CD-2']))).toBe(true);
  });
});

// ── Un camión cerrado está congelado ─────────────────────────────────────────
// El manifiesto ya se emitió: mover carga después deja el papel y la pantalla diciendo cosas
// distintas, sin ningún aviso.

type Tag = { c: string; p: number; b: number };
const t = (c: string): Tag => ({ c, p: 1, b: 0 });

describe('puedeMoverCarga', () => {
  // El tablero pasa su prop `esCerrada`, que ya normaliza vía isCerrada.
  const esCerrada = (p: string) => isCerrada(new Set(['AB-1']), p);
  it('el pool siempre admite movimiento (sacar de un camión abierto es válido)', () => {
    expect(puedeMoverCarga(esCerrada, 'pool')).toBe(true);
  });
  it('un camión abierto admite carga', () => {
    expect(puedeMoverCarga(esCerrada, 'CD-2')).toBe(true);
  });
  it('un camión cerrado NO admite carga', () => {
    expect(puedeMoverCarga(esCerrada, 'AB-1')).toBe(false);
  });
  it('compara normalizado (minúsculas y espacios)', () => {
    expect(puedeMoverCarga(esCerrada, ' ab-1 ')).toBe(false);
  });
});

describe('codsEnCerradas', () => {
  it('devuelve solo las tiendas que viajan en camiones cerrados', () => {
    const asig = { 'AB-1': [t('40LIL'), t('26ALC')], 'CD-2': [t('57CAS')] };
    expect(codsEnCerradas(asig, new Set(['AB-1']))).toEqual(new Set(['40LIL', '26ALC']));
  });
  it('sin cerradas devuelve vacío', () => {
    expect(codsEnCerradas({ 'AB-1': [t('40LIL')] }, new Set()).size).toBe(0);
  });
  it('tolera patentes con lista vacía o ausente', () => {
    const asig = { 'AB-1': [] as Tag[], 'CD-2': undefined as unknown as Tag[] };
    expect(codsEnCerradas(asig, new Set(['AB-1', 'CD-2'])).size).toBe(0);
  });
});

describe('preservarCerradas', () => {
  it('el camión cerrado conserva su carga aunque el motor proponga otra', () => {
    const actuales = { 'AB-1': [t('40LIL')], 'CD-2': [t('26ALC')] };
    const nuevas   = { 'AB-1': [t('99XXX')], 'CD-2': [t('57CAS')] };
    const out = preservarCerradas(nuevas, actuales, new Set(['AB-1']));
    expect(out['AB-1']).toEqual([t('40LIL')]); // el manifiesto manda
    expect(out['CD-2']).toEqual([t('57CAS')]); // el abierto sí se reasigna
  });

  it('"Limpiar" (tablero nuevo vacío) no borra los camiones cerrados', () => {
    const actuales = { 'AB-1': [t('40LIL')], 'CD-2': [t('26ALC')] };
    const out = preservarCerradas({}, actuales, new Set(['AB-1']));
    expect(out).toEqual({ 'AB-1': [t('40LIL')] });
  });

  it('sin cerradas, reemplaza por completo', () => {
    const actuales = { 'AB-1': [t('40LIL')] };
    const nuevas   = { 'CD-2': [t('57CAS')] };
    expect(preservarCerradas(nuevas, actuales, new Set())).toEqual(nuevas);
  });

  it('una patente cerrada que el motor dejó SIN tiendas tampoco se vacía', () => {
    const actuales = { 'AB-1': [t('40LIL')] };
    const out = preservarCerradas({ 'AB-1': [] as Tag[] }, actuales, new Set(['AB-1']));
    expect(out['AB-1']).toEqual([t('40LIL')]);
  });

  it('normaliza al comparar (tablero con minúsculas, set en mayúsculas)', () => {
    const actuales = { 'ab-1': [t('40LIL')] };
    const out = preservarCerradas({ 'ab-1': [t('99XXX')] }, actuales, new Set(['AB-1']));
    expect(out['ab-1']).toEqual([t('40LIL')]);
  });
});
