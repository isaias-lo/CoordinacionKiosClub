import { describe, it, expect } from 'vitest';
import { idsActualizables, type DespachoRow } from '../utils/vueltaIntegrity';

const row = (id: string, seguimiento = 'Listo para despachar', conductor: string | null = null): DespachoRow =>
  ({ id, seguimiento, conductor });

describe('idsActualizables', () => {
  it('1ª vuelta: actualiza todas las filas no finalizadas', () => {
    const rows = [row('a'), row('b', 'Listo para despachar', 'Juan'), row('c')];
    expect(idsActualizables(rows, 1)).toEqual(['a', 'b', 'c']);
  });

  it('vuelta undefined se trata como 1ª vuelta', () => {
    const rows = [row('a'), row('b', 'Listo para despachar', 'Juan')];
    expect(idsActualizables(rows, undefined)).toEqual(['a', 'b']);
  });

  it('excluye filas en estados finales', () => {
    const rows = [row('a', 'Entregado'), row('b', 'Recibido'), row('c', 'Diferencia'), row('d')];
    expect(idsActualizables(rows, 1)).toEqual(['d']);
  });

  it('2ª vuelta (carga extra): NO pisa filas ya despachadas (con conductor)', () => {
    const rows = [
      row('ya1', 'Listo para despachar', 'Juan'),   // despachada en 1ª vuelta
      row('ya2', 'Listo para despachar', '  Ana '),  // conductor con espacios
      row('nueva', 'Listo para despachar', null),    // carga extra sin despachar
      row('nueva2', 'Listo para despachar', ''),     // conductor vacío
    ];
    expect(idsActualizables(rows, 2)).toEqual(['nueva', 'nueva2']);
  });

  it('2ª vuelta: si todas están despachadas, no actualiza ninguna (protege 1ª vuelta)', () => {
    const rows = [row('a', 'Listo para despachar', 'Juan'), row('b', 'Listo para despachar', 'Ana')];
    expect(idsActualizables(rows, 2)).toEqual([]);
  });

  it('2ª vuelta también respeta estados finales', () => {
    const rows = [row('a', 'Entregado', null), row('b', 'Listo para despachar', null)];
    expect(idsActualizables(rows, 2)).toEqual(['b']);
  });
});
