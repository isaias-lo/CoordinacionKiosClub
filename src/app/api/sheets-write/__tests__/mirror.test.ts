import { describe, it, expect } from 'vitest';
import { paraMirror, camposDescartados, COLUMNAS_DESPACHO } from '../mirror';

describe('paraMirror', () => {
  it('saca `fuente`, que es el campo que tumbaba el INSERT entero', () => {
    const rec = { id: 'P101TPS11092026P', cod: '01TPS', tipo: 'Pallet', fuente: 'bodega_congelados' };
    expect(paraMirror(rec)).toEqual({ id: 'P101TPS11092026P', cod: '01TPS', tipo: 'Pallet' });
  });

  it('deja intacto un registro que ya es válido', () => {
    const rec = { id: 'x', fecha: '11/09/2026', cod: '22LGN', peso_kg: 12.5, picking_slot_id: 49 };
    expect(paraMirror(rec)).toEqual(rec);
  });

  it('conserva los nulls: borrar un valor es distinto de no tocarlo', () => {
    expect(paraMirror({ id: 'x', patente: null, conductor: '' })).toEqual({ id: 'x', patente: null, conductor: '' });
  });

  it('un registro vacío no inventa campos', () => {
    expect(paraMirror({})).toEqual({});
  });

  it('las cuatro fuentes que escriben hoy quedan todas fuera', () => {
    for (const f of ['bodega_rm', 'bodega_regiones', 'enrutador', 'bodega_congelados']) {
      expect(paraMirror({ id: 'x', fuente: f })).toEqual({ id: 'x' });
    }
  });
});

describe('camposDescartados', () => {
  it('nombra lo que se va a perder, para poder avisarlo', () => {
    expect(camposDescartados({ id: 'x', fuente: 'enrutador', inventado: 1 })).toEqual(['fuente', 'inventado']);
  });

  it('vacío cuando no se descarta nada', () => {
    expect(camposDescartados({ id: 'x', cod: '01TPS' })).toEqual([]);
  });
});

describe('COLUMNAS_DESPACHO', () => {
  it('incluye las columnas que el espejo escribe de verdad', () => {
    for (const c of ['id', 'fecha', 'cod', 'tienda', 'tipo', 'regimen', 'carga', 'peso_kg',
                     'n_pallet_bulto', 'fecha_armado', 'picking_slot_id', 'seguimiento']) {
      expect(COLUMNAS_DESPACHO.has(c)).toBe(true);
    }
  });

  it('NO incluye `fuente`: esa columna vive en despacho_sesion, no acá', () => {
    expect(COLUMNAS_DESPACHO.has('fuente')).toBe(false);
  });
});
