import { describe, it, expect } from 'vitest';
import type { SesionRow } from '@/lib/despachoSesion';
import { combinarFilasSeco, registrarFilaSeco, combinarPorTienda, type FilasPorBodega } from '../conteoEntreBodegas';

const fila = (fuente: string, tienda_cod: string, pallets: number, bultos = 0, chocolates = 0): SesionRow =>
  ({ fecha: '2026-09-29', fuente, tienda_cod, pallets, bultos, contenedores: 0, chocolates });

describe('conteoEntreBodegas — una tienda con fila en las dos bodegas', () => {
  it('caso real 36CHL (29/09): RM 2P/0B, Nacional 4P/8B → 4P/8B, no 2P/0B ni 6P/8B', () => {
    const r = combinarFilasSeco([fila('santiago', '36CHL', 2, 0), fila('regiones', '36CHL', 4, 8)]);
    expect([r.pallets, r.bultos]).toEqual([4, 8]);
    expect(r.fuente).toBe('regiones');
  });

  it('el ORDEN de llegada no cambia el resultado (lo que hacía que cada equipo viera distinto)', () => {
    const a = new Map() as FilasPorBodega, b = new Map() as FilasPorBodega;
    registrarFilaSeco(a, '27MCH', fila('regiones', '27MCH', 3, 1));
    const efA = registrarFilaSeco(a, '27MCH', fila('santiago', '27MCH', 2, 0)); // RM llega último
    registrarFilaSeco(b, '27MCH', fila('santiago', '27MCH', 2, 0));
    const efB = registrarFilaSeco(b, '27MCH', fila('regiones', '27MCH', 3, 1)); // Nacional llega último
    expect([efA.pallets, efA.bultos]).toEqual([3, 1]);
    expect([efB.pallets, efB.bultos]).toEqual([3, 1]);
  });

  it('una actualización de una bodega reemplaza SU fila, no la de la otra', () => {
    const m = new Map() as FilasPorBodega;
    registrarFilaSeco(m, '46TRE', fila('regiones', '46TRE', 4, 5));
    registrarFilaSeco(m, '46TRE', fila('santiago', '46TRE', 1));
    const ef = registrarFilaSeco(m, '46TRE', fila('regiones', '46TRE', 5, 5)); // Nacional agregó un pallet
    expect([ef.pallets, ef.bultos]).toEqual([5, 5]);
  });

  it('una sola bodega: la fila pasa tal cual', () => {
    const f = fila('santiago', '01TPS', 2, 0, 5);
    expect(combinarFilasSeco([f])).toBe(f);
  });

  it('combinarPorTienda deja una fila por tienda y no mezcla congelados con seco', () => {
    const out = combinarPorTienda([
      fila('santiago', '36CHL', 2), fila('regiones', '36CHL', 4, 8),
      fila('santiago', '01TPS', 2), fila('congelados-santiago', '01TPS', 0, 6),
    ]);
    const seco = out.filter(r => !r.fuente.startsWith('congelados'));
    expect(seco.map(r => [r.tienda_cod, r.pallets, r.bultos]).sort()).toEqual([['01TPS', 2, 0], ['36CHL', 4, 8]]);
    expect(out.find(r => r.fuente === 'congelados-santiago')?.bultos).toBe(6);
  });

  it('respeta la normalización de códigos del llamador', () => {
    const out = combinarPorTienda([fila('santiago', '23PEÑ', 1), fila('regiones', '23PEN', 3)],
      c => c.replace('Ñ', 'N'));
    expect(out).toHaveLength(1);
    expect(out[0].pallets).toBe(3);
  });
});
