import { describe, it, expect } from 'vitest';
import {
  codsAsignados,
  pendientesDelPool,
  flotaConCapacidadRestante,
  fusionarAsignaciones,
  podarVacias,
  tableroConTrabajo,
} from '../asignacionIncremental';
import type { Vehiculo } from '../../data/flota';

const t = (c: string, p = 1, b = 0) => ({ c, p, b });
const v = (p: string, cap: number, extra: Partial<Vehiculo> = {}): Vehiculo => ({
  p, c: cap, b: 0, t: 'camion', tlbd: false, on: true,
  porton: null, refrigerado: false, empresa: 'X', ...extra,
});

describe('codsAsignados', () => {
  it('junta los códigos de todos los camiones', () => {
    expect(codsAsignados({ 'AB-1': [t('40LIL')], 'CD-2': [t('26ALC'), t('57CAS')] }))
      .toEqual(new Set(['40LIL', '26ALC', '57CAS']));
  });
  it('tablero vacío → set vacío', () => {
    expect(codsAsignados({}).size).toBe(0);
  });
});

describe('pendientesDelPool', () => {
  it('deja fuera lo que ya está en un camión', () => {
    const pool = [t('40LIL'), t('26ALC'), t('57CAS')];
    const pend = pendientesDelPool(pool, { 'AB-1': [t('26ALC')] });
    expect(pend.map(s => s.c)).toEqual(['40LIL', '57CAS']);
  });

  // El caso que estaba roto: llaves con lista vacía hacían creer que el tablero tenía trabajo.
  it('las llaves vacías no cuentan como asignación', () => {
    const pend = pendientesDelPool([t('40LIL')], { 'AB-1': [], 'CD-2': [] });
    expect(pend.map(s => s.c)).toEqual(['40LIL']);
  });

  it('todo asignado → nada pendiente', () => {
    expect(pendientesDelPool([t('40LIL')], { 'AB-1': [t('40LIL')] })).toEqual([]);
  });
});

describe('flotaConCapacidadRestante', () => {
  it('descuenta lo que el camión ya lleva', () => {
    const out = flotaConCapacidadRestante([v('AB-1', 10)], { 'AB-1': [t('X', 6)] });
    expect(out).toHaveLength(1);
    expect(out[0].c).toBe(4);
  });

  it('un camión lleno queda fuera de la ronda', () => {
    expect(flotaConCapacidadRestante([v('AB-1', 10)], { 'AB-1': [t('X', 10)] })).toEqual([]);
  });

  it('un camión sobrecargado tampoco entra (capacidad negativa)', () => {
    expect(flotaConCapacidadRestante([v('AB-1', 10)], { 'AB-1': [t('X', 12)] })).toEqual([]);
  });

  it('un camión vacío entra con toda su capacidad', () => {
    expect(flotaConCapacidadRestante([v('AB-1', 10)], {})[0].c).toBe(10);
  });

  it('los camiones apagados no participan', () => {
    expect(flotaConCapacidadRestante([v('AB-1', 10, { on: false })], {})).toEqual([]);
  });

  it('los camiones CERRADOS no participan (su manifiesto ya salió)', () => {
    const out = flotaConCapacidadRestante([v('AB-1', 10), v('CD-2', 10)], {}, p => p === 'AB-1');
    expect(out.map(x => x.p)).toEqual(['CD-2']);
  });

  it('no muta la flota original', () => {
    const flota = [v('AB-1', 10)];
    flotaConCapacidadRestante(flota, { 'AB-1': [t('X', 6)] });
    expect(flota[0].c).toBe(10);
  });
});

describe('fusionarAsignaciones — solo agrega', () => {
  it('lo puesto a mano se queda donde está', () => {
    const actuales = { 'AB-1': [t('40LIL')] };
    const nuevas   = { 'CD-2': [t('26ALC')] };
    expect(fusionarAsignaciones(actuales, nuevas)).toEqual({
      'AB-1': [t('40LIL')],
      'CD-2': [t('26ALC')],
    });
  });

  it('suma al mismo camión sin borrar lo que ya llevaba', () => {
    const out = fusionarAsignaciones({ 'AB-1': [t('40LIL')] }, { 'AB-1': [t('26ALC')] });
    expect(out['AB-1'].map(s => s.c)).toEqual(['40LIL', '26ALC']);
  });

  it('nunca duplica: una tienda ya asignada no se agrega en otro camión', () => {
    const out = fusionarAsignaciones({ 'AB-1': [t('40LIL')] }, { 'CD-2': [t('40LIL')] });
    expect(out['AB-1'].map(s => s.c)).toEqual(['40LIL']);
    expect(out['CD-2']).toBeUndefined();
  });

  it('propuesta vacía → el tablero queda igual', () => {
    const actuales = { 'AB-1': [t('40LIL')] };
    expect(fusionarAsignaciones(actuales, {})).toEqual(actuales);
  });

  it('no muta el tablero original', () => {
    const actuales = { 'AB-1': [t('40LIL')] };
    fusionarAsignaciones(actuales, { 'AB-1': [t('26ALC')] });
    expect(actuales['AB-1']).toHaveLength(1);
  });
});

describe('podarVacias / tableroConTrabajo', () => {
  it('podarVacias saca las patentes sin tiendas', () => {
    expect(podarVacias({ 'AB-1': [t('40LIL')], 'CD-2': [] })).toEqual({ 'AB-1': [t('40LIL')] });
  });

  // La causa raíz de P4: contar llaves daba "el tablero tiene trabajo" para siempre.
  it('tableroConTrabajo cuenta CONTENIDO, no llaves', () => {
    expect(tableroConTrabajo({ 'AB-1': [], 'CD-2': [] })).toBe(false);
    expect(Object.keys({ 'AB-1': [], 'CD-2': [] }).length).toBe(2); // lo que se contaba antes
    expect(tableroConTrabajo({ 'AB-1': [t('40LIL')] })).toBe(true);
    expect(tableroConTrabajo({})).toBe(false);
  });
});
