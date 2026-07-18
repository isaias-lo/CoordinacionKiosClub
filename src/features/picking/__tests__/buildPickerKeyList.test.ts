import { describe, it, expect } from 'vitest';
import { buildPickerKeyList, isCustomPickerKey } from '../picking-utils';
import { CANONICAL_PICKER_KEYS } from '../picking-types';

describe('isCustomPickerKey', () => {
  it('las built-in NO son custom (case-insensitive)', () => {
    expect(isCustomPickerKey('Pickers 1')).toBe(false);
    expect(isCustomPickerKey('pickers 1')).toBe(false);
    expect(isCustomPickerKey('Calidad')).toBe(false);
    expect(isCustomPickerKey('Jefferson Negrete')).toBe(false);
  });
  it('una key nueva SÍ es custom', () => {
    expect(isCustomPickerKey('Pickers 19')).toBe(true);
    expect(isCustomPickerKey('Mario Patiño')).toBe(true);
  });
});

describe('buildPickerKeyList', () => {
  it('sin custom devuelve las built-in en su orden', () => {
    expect(buildPickerKeyList({})).toEqual(CANONICAL_PICKER_KEYS);
  });

  it('agrega las custom después de las built-in', () => {
    const list = buildPickerKeyList({ 'Mario Patiño': 'Mario Patiño', 'Pickers 3': 'Fabian' });
    // 'Pickers 3' es built-in (no se duplica); 'Mario Patiño' es custom → al final.
    expect(list.slice(0, CANONICAL_PICKER_KEYS.length)).toEqual(CANONICAL_PICKER_KEYS);
    expect(list[list.length - 1]).toBe('Mario Patiño');
    expect(list.filter(k => k === 'Pickers 3')).toHaveLength(1);
  });

  it('ordena las custom "Pickers N" por número y luego los nombres alfabéticamente', () => {
    const list = buildPickerKeyList({
      'Zulema':     'Zulema',
      'Pickers 20': 'Pickers 20',
      'Pickers 19': 'Pickers 19',
      'Ana':        'Ana',
    });
    const custom = list.slice(CANONICAL_PICKER_KEYS.length);
    expect(custom).toEqual(['Pickers 19', 'Pickers 20', 'Ana', 'Zulema']);
  });

  it('no duplica una key que solo difiere en mayúsculas de una built-in', () => {
    const list = buildPickerKeyList({ 'pickers 5': 'x', 'PICKERS 18': 'y' });
    expect(list).toEqual(CANONICAL_PICKER_KEYS);
  });
});
