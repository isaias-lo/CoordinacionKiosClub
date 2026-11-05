import { describe, it, expect } from 'vitest';
import { avisoEscaneoCargada, cargaPorTienda, claveTienda, cuantasCargadas, textoCamion, type RutaCargada } from '../cargaEnCamion';

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
