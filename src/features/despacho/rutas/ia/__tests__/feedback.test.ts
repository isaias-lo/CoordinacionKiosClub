import { describe, it, expect } from 'vitest';
import { rutasAAsignacion, contarEdiciones } from '../feedback';

describe('rutasAAsignacion', () => {
  it('convierte rutas a { patente: [cods] } y omite camiones vacíos', () => {
    const rutas = [
      { v: { p: 'AAA111' }, ts: [{ c: '05LP' }, { c: '21NUC' }] },
      { v: { p: 'BBB222' }, ts: [] },
    ];
    expect(rutasAAsignacion(rutas)).toEqual({ AAA111: ['05LP', '21NUC'] });
  });
});

describe('contarEdiciones', () => {
  const ia = { AAA111: ['05LP', '21NUC'], BBB222: ['30PHU'] };

  it('devuelve 0 si no hubo propuesta IA', () => {
    expect(contarEdiciones(null, { AAA111: ['05LP'] })).toBe(0);
    expect(contarEdiciones(undefined, { AAA111: ['05LP'] })).toBe(0);
  });

  it('devuelve 0 si la final respeta la propuesta tal cual', () => {
    expect(contarEdiciones(ia, { AAA111: ['05LP', '21NUC'], BBB222: ['30PHU'] })).toBe(0);
  });

  it('cuenta una tienda movida a otro camión', () => {
    // 21NUC pasó de AAA111 a BBB222
    expect(contarEdiciones(ia, { AAA111: ['05LP'], BBB222: ['30PHU', '21NUC'] })).toBe(1);
  });

  it('cuenta tiendas quitadas y agregadas', () => {
    // 30PHU quitada (estaba en IA, no en final) + 99XXX agregada (en final, no en IA)
    expect(contarEdiciones(ia, { AAA111: ['05LP', '21NUC'], BBB222: ['99XXX'] })).toBe(2);
  });
});
