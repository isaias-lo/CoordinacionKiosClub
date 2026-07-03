import { describe, it, expect } from 'vitest';
import { parseProposal, extractJson } from '../parseProposal';
import type { IAStore, IATruck } from '../types';

const stores: IAStore[] = [
  { cod: '05LP', p: 2, b: 0, ch: 4 },
  { cod: '56PZA', p: 2, b: 1, ch: 6 },
  { cod: '21NUC', p: 2, b: 0, ch: 4 },
  { cod: '03VIT', p: 1, b: 0, ch: 2 },
];
const trucks: IATruck[] = [
  { patente: 'PTFZ21', capP: 10, capB: 20 },
  { patente: 'TYKK42', capP: 4, capB: 20 },
];

describe('extractJson', () => {
  it('extrae JSON con code fence', () => {
    expect(extractJson('```json\n{"A":["x"]}\n```')).toEqual({ A: ['x'] });
  });
  it('extrae JSON con texto alrededor', () => {
    expect(extractJson('Aquí tienes:\n{"A":["x"]} listo')).toEqual({ A: ['x'] });
  });
  it('devuelve null si no hay JSON', () => {
    expect(extractJson('no hay json')).toBeNull();
  });
});

describe('parseProposal', () => {
  it('asigna cods válidos a la patente correcta', () => {
    const raw = '{"PTFZ21":["05LP","21NUC"]}';
    const { asignaciones } = parseProposal(raw, stores, trucks);
    expect(asignaciones.PTFZ21.map(s => s.c)).toEqual(['05LP', '21NUC']);
    expect(asignaciones.PTFZ21[0]).toMatchObject({ c: '05LP', p: 2, ch: 4 });
  });

  it('ignora patentes desconocidas con warning', () => {
    const { asignaciones, warnings } = parseProposal('{"XXXX00":["05LP"]}', stores, trucks);
    expect(asignaciones.XXXX00).toBeUndefined();
    expect(warnings.some(w => w.includes('XXXX00'))).toBe(true);
  });

  it('ignora cods desconocidos con warning', () => {
    const { warnings } = parseProposal('{"PTFZ21":["ZZZ99"]}', stores, trucks);
    expect(warnings.some(w => w.includes('ZZZ99'))).toBe(true);
  });

  it('no duplica una tienda entre camiones (gana la primera)', () => {
    const raw = '{"PTFZ21":["05LP"],"TYKK42":["05LP"]}';
    const { asignaciones, warnings } = parseProposal(raw, stores, trucks);
    expect(asignaciones.PTFZ21.map(s => s.c)).toEqual(['05LP']);
    expect(asignaciones.TYKK42).toBeUndefined();
    expect(warnings.some(w => w.includes('05LP'))).toBe(true);
  });

  it('repara exceso de capacidad: lo que no cabe queda sin asignar', () => {
    // TYKK42 capP=4; 05LP(2)+21NUC(2)=4 ok, 56PZA(2) excede → fuera
    const raw = '{"TYKK42":["05LP","21NUC","56PZA"]}';
    const { asignaciones, warnings } = parseProposal(raw, stores, trucks);
    expect(asignaciones.TYKK42.map(s => s.c)).toEqual(['05LP', '21NUC']);
    expect(warnings.some(w => w.includes('56PZA'))).toBe(true);
  });

  it('reporta tiendas que quedaron en el pool', () => {
    const { warnings } = parseProposal('{"PTFZ21":["05LP"]}', stores, trucks);
    expect(warnings.some(w => w.includes('pool'))).toBe(true);
  });

  it('respuesta ininterpretable → warning y sin asignaciones', () => {
    const { asignaciones, warnings } = parseProposal('bla bla', stores, trucks);
    expect(Object.keys(asignaciones)).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
