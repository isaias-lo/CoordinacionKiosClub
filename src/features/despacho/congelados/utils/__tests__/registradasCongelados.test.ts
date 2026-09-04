import { describe, it, expect } from 'vitest';
import { registradasDesdeSesion, fuenteDeZona, type FilaSesion } from '../registradasCongelados';

const fila = (tienda_cod: string, fuente: string, bultos = 1): FilaSesion =>
  ({ tienda_cod, fuente, pallets: 0, bultos, contenedores: 0, chocolates: 0 });

describe('fuenteDeZona', () => {
  it('nacional va a regiones; el resto a santiago', () => {
    expect(fuenteDeZona('nacional')).toBe('congelados-regiones');
    expect(fuenteDeZona('rmcosta')).toBe('congelados-santiago');
  });
});

describe('registradasDesdeSesion', () => {
  it('marca las tiendas con cantidades de SU zona', () => {
    const filas = [fila('40LIL', 'congelados-santiago'), fila('57CAS', 'congelados-regiones')];
    expect(registradasDesdeSesion(filas, 'rmcosta')).toEqual(new Set(['40LIL']));
    expect(registradasDesdeSesion(filas, 'nacional')).toEqual(new Set(['57CAS']));
  });

  it('ignora el despacho seco: no es Congelados', () => {
    expect(registradasDesdeSesion([fila('40LIL', 'santiago')], 'rmcosta').size).toBe(0);
  });

  // Registrar y dejar la tienda en cero equivale a no haberla registrado: si contara, quedaría
  // marcada como lista sin llevar nada.
  it('una fila en cero no cuenta como registrada', () => {
    expect(registradasDesdeSesion([fila('40LIL', 'congelados-santiago', 0)], 'rmcosta').size).toBe(0);
  });

  it('cualquier tipo de carga cuenta', () => {
    const soloPallets: FilaSesion = { tienda_cod: 'X', fuente: 'congelados-santiago', pallets: 2 };
    expect(registradasDesdeSesion([soloPallets], 'rmcosta')).toEqual(new Set(['X']));
  });

  it('tolera listas vacías, nulos y campos ausentes', () => {
    expect(registradasDesdeSesion([], 'rmcosta').size).toBe(0);
    expect(registradasDesdeSesion(undefined as unknown as FilaSesion[], 'rmcosta').size).toBe(0);
    expect(registradasDesdeSesion([{ tienda_cod: 'X' }], 'rmcosta').size).toBe(0);
  });
});
