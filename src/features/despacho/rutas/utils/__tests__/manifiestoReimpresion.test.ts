import { describe, it, expect } from 'vitest';
import {
  manifiestoDesdeGuardado, filasReimpresion, idsDePatente, chocolatesPorTienda, claveChocolates,
  type ManifiestoGuardadoCompleto, type ContextoReimpresion,
} from '../manifiestoReimpresion';
import { diaVecino } from '../reimprimirDia';

const guardado = (o: Partial<ManifiestoGuardadoCompleto> = {}): ManifiestoGuardadoCompleto => ({
  id: 10, fecha: '2026-11-09', fecha_salida: '2026-11-10', codigo_ruta: 'RUTA-091126-03',
  chofer: 'Pedro', patente: 'VKDZ85', bodega_origen: 'Santiago', estado: 'en_camino',
  token_qr: 'tok-real', tipo: 'seco', created_at: '2026-11-09T20:00:00Z',
  ruta_tiendas: [
    { store_cod: '16PQA', nombre: 'Pqa', ventana: '08:00-12:00', orden: 2, pallets: 3, bultos: 1, contenedores: 0 },
    { store_cod: '01TPS', nombre: null, ventana: null, orden: 1, pallets: 2, bultos: 4, contenedores: 1 },
  ],
  ...o,
});

const ctx = (o: Partial<ContextoReimpresion> = {}): ContextoReimpresion => ({
  tienda: c => ({ '01TPS': { n: 'Tienda Tps', v: '09:00-13:00', vCong: '07:00-09:00', observacion: 'puerta trasera' } } as Record<string, { n: string; v: string; vCong?: string; observacion?: string }>)[c],
  transporte: p => (p === 'VKDZ85' ? 'Transportes X' : undefined),
  ...o,
});

describe('manifiestoDesdeGuardado', () => {
  it('conserva el código, el QR, el chofer y el estado guardados', () => {
    const m = manifiestoDesdeGuardado(guardado(), 0, ctx());
    expect(m).toMatchObject({
      id: 10, codigo_ruta: 'RUTA-091126-03', token_qr: 'tok-real', chofer: 'Pedro',
      estado: 'en_camino', fecha: '2026-11-09', fecha_salida: '2026-11-10', transporte: 'Transportes X',
    });
  });

  it('respeta el orden guardado de las paradas', () => {
    const m = manifiestoDesdeGuardado(guardado(), 0, ctx());
    expect(m.tiendas.map(t => t.store_cod)).toEqual(['01TPS', '16PQA']);
    expect(m.tiendas.map(t => t.orden)).toEqual([1, 2]);
  });

  it('completa nombre, ventana y observación desde el catálogo cuando la fila no los trae', () => {
    const t = manifiestoDesdeGuardado(guardado(), 0, ctx()).tiendas[0];
    expect(t).toMatchObject({ nombre: 'Tienda Tps', ventana: '09:00-13:00', observacion: 'puerta trasera' });
  });

  it('en congelado usa la ventana de congelados y no suma chocolates', () => {
    const choc = new Map([[claveChocolates('2026-11-09', '01TPS'), 5]]);
    const m = manifiestoDesdeGuardado(guardado({ tipo: 'congelado' }), 0, ctx({ chocolates: choc }));
    expect(m.tipo).toBe('congelado');
    expect(m.tiendas[0].ventana).toBe('07:00-09:00');
    expect(m.total_chocolates).toBe(0);
  });

  it('toma los chocolates de lo registrado en Bodega el día de ARMADO', () => {
    const choc = new Map([
      [claveChocolates('2026-11-09', '01tps'), 4],
      [claveChocolates('2026-11-10', '16PQA'), 9],  // otro día: no cuenta
    ]);
    const m = manifiestoDesdeGuardado(guardado(), 0, ctx({ chocolates: choc }));
    expect(m.tiendas.find(t => t.store_cod === '01TPS')?.chocolates).toBe(4);
    expect(m.tiendas.find(t => t.store_cod === '16PQA')?.chocolates).toBe(0);
    expect(m.total_chocolates).toBe(4);
  });

  it('suma los totales desde lo guardado', () => {
    const m = manifiestoDesdeGuardado(guardado(), 0, ctx());
    expect(m.total_pallets).toBe(5);
    expect(m.total_bultos).toBe(5);
  });

  it('aguanta una fila incompleta sin romperse', () => {
    const m = manifiestoDesdeGuardado(guardado({ chofer: null, estado: null, token_qr: null, ruta_tiendas: null, bodega_origen: null }), 0,
      ctx({ transporte: () => undefined }));
    expect(m).toMatchObject({ chofer: 'Sin asignar', estado: 'pendiente', token_qr: undefined, tiendas: [], transporte: 'Luis Fica', bodega_origen: 'Santiago' });
  });
});

describe('filasReimpresion', () => {
  it('una fila por manifiesto, aunque la patente se repita (1ª y 2ª vuelta)', () => {
    const filas = filasReimpresion([
      guardado({ id: 2, created_at: '2026-11-09T21:00:00Z', codigo_ruta: 'RUTA-091126-04' }),
      guardado({ id: 1, created_at: '2026-11-09T20:00:00Z' }),
    ]);
    expect(filas.map(f => f.id)).toEqual([1, 2]);
    expect(filas[0]).toMatchObject({ patente: 'VKDZ85', tiendas: 2, pallets: 5, bultos: 5, tipo: 'seco' });
  });

  it('descarta filas sin id o sin patente, y acepta null', () => {
    expect(filasReimpresion(null)).toEqual([]);
    expect(filasReimpresion([guardado({ patente: '  ' })])).toEqual([]);
    expect(filasReimpresion([{ ...guardado(), id: undefined as unknown as number }])).toEqual([]);
  });
});

describe('idsDePatente', () => {
  it('encuentra todas las vueltas de la patente sin importar mayúsculas ni espacios', () => {
    const gs = [guardado({ id: 1 }), guardado({ id: 2, patente: 'OTRA11' }), guardado({ id: 3, patente: 'vkdz85 ' })];
    expect(idsDePatente(gs, ' VKDZ85')).toEqual([1, 3]);
    expect(idsDePatente(gs, 'NADA')).toEqual([]);
  });
});

describe('chocolatesPorTienda', () => {
  it('suma las dos bodegas de la misma tienda y día', () => {
    const m = chocolatesPorTienda([
      { fecha: '2026-11-09', tienda_cod: '01TPS', chocolates: 2 },
      { fecha: '2026-11-09', tienda_cod: '01tps', chocolates: 3 },
      { fecha: '2026-11-09', tienda_cod: '16PQA', chocolates: null },
      { fecha: '2026-11-09', tienda_cod: '', chocolates: 7 },
    ]);
    expect(m.get(claveChocolates('2026-11-09', '01TPS'))).toBe(5);
    expect(m.get(claveChocolates('2026-11-09', '16PQA'))).toBe(0);
    expect(m.size).toBe(2);
  });
});

describe('diaVecino', () => {
  it('cruza mes, año y el cambio de hora sin saltarse días', () => {
    expect(diaVecino('2026-11-01', -1)).toBe('2026-10-31');
    expect(diaVecino('2026-12-31', 1)).toBe('2027-01-01');
    expect(diaVecino('2026-09-06', 1)).toBe('2026-09-07');
    expect(diaVecino('2026-04-05', -1)).toBe('2026-04-04');
  });
});
