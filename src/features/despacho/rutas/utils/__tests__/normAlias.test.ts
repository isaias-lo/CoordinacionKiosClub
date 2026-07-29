import { describe, it, expect } from 'vitest';
import { norm } from '../helpers';

// Fija que los códigos cortos/legacy se colapsan al canónico vía ALIAS.
// Regresión: "CAS" (Castro) aparecía duplicado junto a "57CAS" en el enrutador
// porque faltaba su alias → norm no lo deduplicaba.
describe('norm() dedup por ALIAS', () => {
  it('CAS → 57CAS (bug del duplicado 57CAS/CAS)', () => {
    expect(norm('CAS')).toBe('57CAS');
    expect(norm('cas')).toBe('57CAS');
    expect(norm('57CAS')).toBe('57CAS');
  });

  it('otros short-codes conocidos se canonizan', () => {
    expect(norm('MPQ')).toBe('54MPQ');
    expect(norm('SCL')).toBe('02SCL');
  });

  it('un código canónico sin alias se devuelve tal cual (mayúsculas)', () => {
    expect(norm('12LAS')).toBe('12LAS');
    expect(norm('26alc')).toBe('26ALC');
  });
});
