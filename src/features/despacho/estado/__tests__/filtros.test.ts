import { describe, it, expect } from 'vitest';
import { coincideFila, type FiltroFila } from '../filtros';

const base: FiltroFila = { date: '', isRecepcion: false, displayDate: '', search: '', searchKeys: ['cod', 'tienda'], segFilter: '' };

describe('coincideFila', () => {
  it('sin filtros, toda fila coincide', () => {
    expect(coincideFila({ cod: '18FLO' }, base)).toBe(true);
  });

  it('filtro por fecha: no-recepción compara row.fecha === displayDate', () => {
    const f = { ...base, date: '2026-07-30', displayDate: '30/07/2026' };
    expect(coincideFila({ fecha: '30/07/2026' }, f)).toBe(true);
    expect(coincideFila({ fecha: '29/07/2026' }, f)).toBe(false);
  });

  it('filtro por fecha: recepción compara created_at.startsWith(date)', () => {
    const f = { ...base, isRecepcion: true, date: '2026-07-31' };
    expect(coincideFila({ created_at: '2026-07-31T03:37:00Z' }, f)).toBe(true);
    expect(coincideFila({ created_at: '2026-07-30T20:00:00Z' }, f)).toBe(false);
  });

  it('semáforo: segFilter filtra por seguimiento; vacío = todos', () => {
    expect(coincideFila({ seguimiento: 'Pendiente' }, { ...base, segFilter: 'Pendiente' })).toBe(true);
    expect(coincideFila({ seguimiento: 'Registrado' }, { ...base, segFilter: 'Pendiente' })).toBe(false);
    expect(coincideFila({ seguimiento: 'Registrado' }, { ...base, segFilter: '' })).toBe(true);
  });

  it('búsqueda: matchea en cualquiera de searchKeys, case-insensitive', () => {
    const f = { ...base, search: 'flor' };
    expect(coincideFila({ cod: '18FLO', tienda: 'Florida' }, f)).toBe(true);
    expect(coincideFila({ cod: '26ALC', tienda: 'Alto las Condes' }, f)).toBe(false);
  });

  it('combina fecha + semáforo + búsqueda (AND)', () => {
    const f = { ...base, date: '2026-07-30', displayDate: '30/07/2026', segFilter: 'Pendiente', search: '18' };
    expect(coincideFila({ fecha: '30/07/2026', seguimiento: 'Pendiente', cod: '18FLO' }, f)).toBe(true);
    expect(coincideFila({ fecha: '30/07/2026', seguimiento: 'Recibido',  cod: '18FLO' }, f)).toBe(false);
  });
});
