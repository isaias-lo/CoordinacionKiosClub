import { describe, it, expect } from 'vitest';
import { parseSavedNames, serializeSavedNames } from '../picking-utils';

// Bug: SAVED_NAMES_KEY (localStorage) no estaba delimitado por fecha — un nombre de picker
// entrado ayer para "39PSB__pickers 3" reaparecía hoy porque los responsables de Odoo son
// slots fijos que repiten la misma state_key todos los días.
describe('parseSavedNames', () => {
  const today = '2026-07-30';

  it('formato nuevo con fecha de hoy → devuelve los nombres', () => {
    const raw = serializeSavedNames({ '39PSB__pickers 3': 'Zervens' }, today);
    expect(parseSavedNames(raw, today)).toEqual({ '39PSB__pickers 3': 'Zervens' });
  });

  it('formato nuevo con fecha de ayer → {} (el bug ya no reaparece)', () => {
    const raw = serializeSavedNames({ '39PSB__pickers 3': 'Fabian' }, '2026-07-29');
    expect(parseSavedNames(raw, today)).toEqual({});
  });

  it('formato viejo sin wrapper (Record plano) → {} (dato del bug, se descarta)', () => {
    const raw = JSON.stringify({ '39PSB__pickers 3': 'Fabian' });
    expect(parseSavedNames(raw, today)).toEqual({});
  });

  it('null / vacío / corrupto → {}', () => {
    expect(parseSavedNames(null, today)).toEqual({});
    expect(parseSavedNames('', today)).toEqual({});
    expect(parseSavedNames('{not json', today)).toEqual({});
  });
});

describe('serializeSavedNames', () => {
  it('envuelve los nombres con la fecha dada', () => {
    const raw = serializeSavedNames({ a: 'b' }, '2026-07-30');
    expect(JSON.parse(raw)).toEqual({ date: '2026-07-30', names: { a: 'b' } });
  });
});
