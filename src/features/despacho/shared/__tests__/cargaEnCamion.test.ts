import { describe, it, expect } from 'vitest';
import { avisoEscaneoCargada, cargaPorTienda, claveTienda, diaDeLaCarga, faltaFechaOrigen, cuantasCargadas, textoCamion, type RutaCargada } from '../cargaEnCamion';

const ruta = (patente: string, created_at: string, cods: string[], extra: Partial<RutaCargada> = {}): RutaCargada => ({
  patente, created_at, codigo_ruta: `R-${created_at}`, tipo: 'seco', ruta_tiendas: cods.map(store_cod => ({ store_cod })), ...extra,
});

describe('cargaPorTienda', () => {
  it('cada tienda queda con la patente de su camión', () => {
    const m = cargaPorTienda([ruta('TDCV15', '2026-11-04T15:11:54Z', ['06MQH', '12LAS']), ruta('rgzj70', '2026-11-04T14:38:39Z', ['14PF'])]);
    expect(m.get('06MQH')?.patente).toBe('TDCV15');
    expect(m.get('14PF')?.patente).toBe('RGZJ70');
    expect(m.has('02SCL')).toBe(false);
  });

  it('manda el último manifiesto que nombra la tienda, aunque lleguen desordenados', () => {
    const m = cargaPorTienda([
      ruta('PTFZ21', '2026-11-04T16:00:00Z', ['48BRU']),
      ruta('VRYL52', '2026-11-04T15:00:00Z', ['48BRU']),
    ]);
    expect(m.get('48BRU')).toEqual({ patente: 'PTFZ21', codigoRuta: 'R-2026-11-04T16:00:00Z', en: '2026-11-04T16:00:00Z' });
  });

  it('ignora congelados en seco, y al revés', () => {
    const rutas = [ruta('VKDZ85', '2026-11-04T15:58:07Z', ['09LEO'], { tipo: 'congelado' }), ruta('RZBL80', '2026-11-04T15:58:52Z', ['40LIL'])];
    expect([...cargaPorTienda(rutas).keys()]).toEqual(['40LIL']);
    expect([...cargaPorTienda(rutas, 'congelado').keys()]).toEqual(['09LEO']);
  });

  it('una ruta sin tipo cuenta como seca; sin patente no cuenta', () => {
    const m = cargaPorTienda([ruta('AB1234', '2026-11-04T10:00:00Z', ['01TPS'], { tipo: null }), ruta('  ', '2026-11-04T11:00:00Z', ['13PIE'])]);
    expect(m.has('01TPS')).toBe(true);
    expect(m.has('13PIE')).toBe(false);
  });

  it('aguanta tiendas nulas y rutas sin tiendas', () => {
    expect(cargaPorTienda([{ patente: 'X', created_at: 'a', ruta_tiendas: null }, { patente: 'Y', created_at: 'b', ruta_tiendas: [{ store_cod: null }] }]).size).toBe(0);
  });
});

describe('claveTienda y textos', () => {
  it('el código formateado y el crudo son la misma tienda', () => {
    expect(claveTienda('14 pf')).toBe('14PF');
    const m = cargaPorTienda([ruta('TDCV15', 'a', ['14PF'])]);
    expect(cuantasCargadas(['14 PF', '02 SCL'], m)).toBe(1);
  });

  it('al escanear: fuerte si la unidad no está guardada, informativo si ya lo está', () => {
    expect(avisoEscaneoCargada('TDCV15', true)).toEqual({ texto: 'la tienda ya salió en TDCV15: avisa a despacho', advertir: true });
    expect(avisoEscaneoCargada('TDCV15', false)).toEqual({ texto: 'ya cargada en TDCV15', advertir: false });
  });

  it('dice la patente', () => {
    expect(textoCamion({ patente: 'TDCV15', en: 'x' })).toBe('Cargada en TDCV15');
  });
});

describe('2ª vuelta: el manifiesto cuenta para el día cuya carga lleva', () => {
  // 12/11/2026: los cuatro camiones cerrados ese día eran de 2ª vuelta del 11. 02SCL y 05LP también
  // tenían pedido el 12 y Bodega los pintaba «Cargada en VRYL52».
  const v2 = ruta('VRYL52', '2026-11-12T11:48:14Z', ['05LP', '12LAS', '02SCL', '30PHU'], { fecha: '2026-11-12', fecha_origen: '2026-11-11' });
  const v1 = ruta('PTFZ21', '2026-11-12T15:00:00Z', ['14PF'], { fecha: '2026-11-12', fecha_origen: null });

  it('en el día de hoy no marca las tiendas que salieron con carga de ayer', () => {
    const m = cargaPorTienda([v2, v1], 'seco', '2026-11-12');
    expect(m.has('02SCL')).toBe(false);
    expect(m.has('05LP')).toBe(false);
    expect(m.get('14PF')?.patente).toBe('PTFZ21');
  });

  it('en el día de origen sí las marca, aunque el camión se cerró después', () => {
    const m = cargaPorTienda([v2, v1], 'seco', '2026-11-11');
    expect(m.get('02SCL')?.patente).toBe('VRYL52');
    expect(m.has('14PF')).toBe(false);
  });

  it('sin `dia` cuenta todo, como antes', () => {
    expect(cargaPorTienda([v2, v1]).size).toBe(5);
  });

  it('diaDeLaCarga: fecha_origen si la hay, si no fecha', () => {
    expect(diaDeLaCarga({ fecha: '2026-11-12', fecha_origen: '2026-11-11' })).toBe('2026-11-11');
    expect(diaDeLaCarga({ fecha: '2026-11-12', fecha_origen: null })).toBe('2026-11-12');
    expect(diaDeLaCarga({})).toBeNull();
  });
});

describe('faltaFechaOrigen', () => {
  it('reconoce los errores de columna inexistente', () => {
    expect(faltaFechaOrigen("Could not find the 'fecha_origen' column of 'rutas_despacho' in the schema cache")).toBe(true);
    expect(faltaFechaOrigen('column rutas_despacho.fecha_origen does not exist')).toBe(true);
  });
  it('no confunde otros errores', () => {
    expect(faltaFechaOrigen('duplicate key value violates unique constraint')).toBe(false);
    expect(faltaFechaOrigen('column patente does not exist')).toBe(false);
    expect(faltaFechaOrigen(null)).toBe(false);
  });
});
