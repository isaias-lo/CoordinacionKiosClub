import { describe, it, expect } from 'vitest';
import {
  eventMatchesType, eventMatchesStore,
  type AnyEv, type FilterCat,
} from '../activity-filters';

const printEv = (storeCod = '42ANP'): AnyEv =>
  ({ kind: 'print', at: '', storeCod, pickerLabel: '', pallets: 1, bultos: 0, tiposPresentes: ['P'], fromPresence: false });
const palletEv = (eventType: 'crear' | 'eliminar', palletId: number | null, storeCod = '42ANP'): AnyEv =>
  ({ kind: 'pallet', at: '', eventType, storeCod, tipo: 'P', pickerLabel: '', palletId });
const nameEv = (): AnyEv =>
  ({ kind: 'name', at: '', pickerKey: 'P1', oldName: 'a', newName: 'b' });

const set = (...c: FilterCat[]) => new Set<FilterCat>(c);
const noErr = new Set<number>();

describe('eventMatchesType', () => {
  it('set vacío → pasa todo', () => {
    expect(eventMatchesType(printEv(), set(), noErr)).toBe(true);
    expect(eventMatchesType(palletEv('crear', 1), set(), noErr)).toBe(true);
    expect(eventMatchesType(nameEv(), set(), noErr)).toBe(true);
  });

  it('filtra por una sola categoría', () => {
    expect(eventMatchesType(printEv(), set('print'), noErr)).toBe(true);
    expect(eventMatchesType(palletEv('crear', 1), set('print'), noErr)).toBe(false);
    expect(eventMatchesType(palletEv('crear', 1), set('crear'), noErr)).toBe(true);
    expect(eventMatchesType(palletEv('eliminar', 1), set('crear'), noErr)).toBe(false);
    expect(eventMatchesType(nameEv(), set('name'), noErr)).toBe(true);
  });

  it('OR: dos categorías muestran ambas', () => {
    const f = set('crear', 'name');
    expect(eventMatchesType(palletEv('crear', 1), f, noErr)).toBe(true);
    expect(eventMatchesType(nameEv(), f, noErr)).toBe(true);
    expect(eventMatchesType(palletEv('eliminar', 1), f, noErr)).toBe(false);
    expect(eventMatchesType(printEv(), f, noErr)).toBe(false);
  });

  it('errores = par completo (creó + eliminó del pallet con reincidencia)', () => {
    const errIds = new Set<number>([7]);
    expect(eventMatchesType(palletEv('crear', 7), set('error'), errIds)).toBe(true);
    expect(eventMatchesType(palletEv('eliminar', 7), set('error'), errIds)).toBe(true);
    // un pallet que no es parte de un par no cuenta como error
    expect(eventMatchesType(palletEv('eliminar', 99), set('error'), errIds)).toBe(false);
    // sin pallet_id no puede ser error
    expect(eventMatchesType(palletEv('crear', null), set('error'), errIds)).toBe(false);
  });
});

describe('eventMatchesStore', () => {
  it('null → todas', () => {
    expect(eventMatchesStore(printEv('42ANP'), null)).toBe(true);
    expect(eventMatchesStore(nameEv(), null)).toBe(true);
  });

  it('filtra por tienda; los cambios de nombre (sin tienda) quedan fuera', () => {
    expect(eventMatchesStore(printEv('42ANP'), '42ANP')).toBe(true);
    expect(eventMatchesStore(palletEv('crear', 1, '42ANP'), '42ANP')).toBe(true);
    expect(eventMatchesStore(printEv('28TEM'), '42ANP')).toBe(false);
    expect(eventMatchesStore(nameEv(), '42ANP')).toBe(false);
  });
});
