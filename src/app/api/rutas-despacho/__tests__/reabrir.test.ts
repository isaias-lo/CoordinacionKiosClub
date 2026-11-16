import { describe, it, expect } from 'vitest';
import { codigoEsDeOtroCamion, elegirManifiestoAReabrir, mismasTiendas, motivoNoReabrir } from '../reabrir';

const fila = (id: number, patente: string, cods: string[], tipo = 'seco') =>
  ({ id, patente, tipo, ruta_tiendas: cods.map(store_cod => ({ store_cod })) });

describe('mismasTiendas', () => {
  it('no importa el orden ni los repetidos', () => {
    expect(mismasTiendas(['06MQH', '01TPS'], ['01TPS', '06MQH', '06MQH'])).toBe(true);
  });
  it('una tienda de más o de menos ya no es lo mismo', () => {
    expect(mismasTiendas(['06MQH'], ['06MQH', '01TPS'])).toBe(false);
  });
});

describe('elegirManifiestoAReabrir', () => {
  it('con un solo manifiesto de la patente, es ese', () => {
    expect(elegirManifiestoAReabrir([fila(1, 'TYKK42', ['60PBL'])], 'tykk42', 'seco', ['60PBL'])?.id).toBe(1);
  });

  it('1ª y 2ª vuelta de la misma patente: elige el que calza tienda por tienda', () => {
    const c = [fila(1, 'TYKK42', ['60PBL', '06MQH']), fila(2, 'TYKK42', ['01TPS'])];
    expect(elegirManifiestoAReabrir(c, 'TYKK42', 'seco', ['01TPS'])?.id).toBe(2);
    expect(elegirManifiestoAReabrir(c, 'TYKK42', 'seco', ['06MQH', '60PBL'])?.id).toBe(1);
  });

  it('varios y ninguno calza: no adivina', () => {
    const c = [fila(1, 'TYKK42', ['60PBL']), fila(2, 'TYKK42', ['01TPS'])];
    expect(elegirManifiestoAReabrir(c, 'TYKK42', 'seco', ['59EGN'])).toBeNull();
  });

  it('separa seco de congelado aunque la patente sea la misma', () => {
    const c = [fila(1, 'TYKK42', ['60PBL'], 'seco'), fila(2, 'TYKK42', ['60PBL'], 'congelado')];
    expect(elegirManifiestoAReabrir(c, 'TYKK42', 'congelado', ['60PBL'])?.id).toBe(2);
  });

  it('otra patente no cuenta', () => {
    expect(elegirManifiestoAReabrir([fila(1, 'VRYL52', ['60PBL'])], 'TYKK42', 'seco', ['60PBL'])).toBeNull();
  });
});

describe('motivoNoReabrir', () => {
  const quieto = { estado: 'pendiente', tiendas: [{ estado_entrega: 'pendiente', hora_entrega: null }], eventos: 0, unidadesMovidas: 0 };

  it('un camión que no ha salido se puede reabrir', () => {
    expect(motivoNoReabrir(quieto)).toBeNull();
  });
  it('la ruta en camino no', () => {
    expect(motivoNoReabrir({ ...quieto, estado: 'en_camino' })).toMatch(/ya salió/);
  });
  it('una parada entregada o intentada no', () => {
    expect(motivoNoReabrir({ ...quieto, tiendas: [{ estado_entrega: 'entregado', hora_entrega: null }] })).toMatch(/paradas/);
    expect(motivoNoReabrir({ ...quieto, tiendas: [{ estado_entrega: 'pendiente', hora_entrega: '10:30' }] })).toMatch(/paradas/);
  });
  it('si el chofer ya escaneó el QR no', () => {
    expect(motivoNoReabrir({ ...quieto, eventos: 1 })).toMatch(/chofer/);
  });
  it('si una unidad avanzó en trazabilidad no', () => {
    expect(motivoNoReabrir({ ...quieto, unidadesMovidas: 2 })).toMatch(/trazabilidad/);
  });
});

describe('codigoEsDeOtroCamion', () => {
  it('otra patente: es ajeno', () => {
    expect(codigoEsDeOtroCamion({ patente: 'VRYL52', cods: ['01TPS'] }, { patente: 'TYKK42', cods: ['60PBL'] })).toBe(true);
  });
  it('misma patente y mismas tiendas: es el reintento del mismo', () => {
    expect(codigoEsDeOtroCamion({ patente: 'tykk42', cods: ['60PBL'] }, { patente: 'TYKK42', cods: ['60PBL'] })).toBe(false);
  });
  it('misma patente con otras tiendas: es su manifiesto de la otra vuelta', () => {
    expect(codigoEsDeOtroCamion({ patente: 'TYKK42', cods: ['01TPS'] }, { patente: 'TYKK42', cods: ['60PBL'] })).toBe(true);
  });
  it('un guardado a medias, sin paradas, se completa: no es ajeno', () => {
    expect(codigoEsDeOtroCamion({ patente: 'TYKK42', cods: [] }, { patente: 'TYKK42', cods: ['60PBL'] })).toBe(false);
  });
});
