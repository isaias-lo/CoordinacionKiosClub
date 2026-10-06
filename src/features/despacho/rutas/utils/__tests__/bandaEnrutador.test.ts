import { describe, it, expect } from 'vitest';
import { bandaTablero, bandaSegundaVuelta, bandaFija, PASOS_DIA, type BandaTableroInput } from '../bandaEnrutador';
import { FASES } from '../faseEnrutador';

const base: BandaTableroInput = {
  poolCount: 0, asignadasCount: 0, camionesConAsig: 0, cerradasCount: 0, diaCerrado: false,
  listasSinAsignar: 0, esperandoBodega: 0,
};
const seco = { seco: true };
const cong = { seco: false };

describe('bandaTablero (Despacho)', () => {
  it('sin pool: espera a Bodega y ofrece actualizar', () => {
    const b = bandaTablero(base, seco);
    expect(b).toMatchObject({ paso: 1, titular: 'Esperando a Bodega', accion: { id: 'actualizar' } });
  });

  it('pool sin asignar: cuenta solo las listas y ofrece asignarlas', () => {
    const b = bandaTablero({ ...base, poolCount: 6, listasSinAsignar: 5, esperandoBodega: 1 }, seco);
    expect(b.paso).toBe(1);
    expect(b.titular).toBe('5 tiendas listas para asignar');
    expect(b.subtitulo).toBe('Ningún camión tiene tiendas todavía · 1 más espera que Bodega la termine');
    expect(b.accion).toEqual({ id: 'asignar', texto: 'Asignar las 5 que faltan' });
  });

  it('asignando: lo que falta, lo hecho y lo que espera a Bodega', () => {
    const b = bandaTablero({ ...base, poolCount: 21, asignadasCount: 15, camionesConAsig: 4, listasSinAsignar: 5, esperandoBodega: 1 }, seco);
    expect(b.paso).toBe(2);
    expect(b.titular).toBe('Faltan 5 tiendas por asignar');
    expect(b.subtitulo).toBe('15 ya van en 4 camiones · 1 más espera que Bodega la termine');
    expect(b.accion?.id).toBe('asignar');
  });

  it('una sola tienda: singular', () => {
    const b = bandaTablero({ ...base, poolCount: 3, asignadasCount: 2, camionesConAsig: 1, listasSinAsignar: 1 }, seco);
    expect(b.titular).toBe('Faltan 1 tienda por asignar');
    expect(b.subtitulo).toBe('2 ya van en 1 camión');
    expect(b.accion?.texto).toBe('Asignar la que falta');
  });

  it('lo listo ya asignado y el resto en Bodega: no ofrece asignar', () => {
    const b = bandaTablero({ ...base, poolCount: 10, asignadasCount: 8, camionesConAsig: 2, esperandoBodega: 2 }, seco);
    expect(b.titular).toBe('Lo listo ya va en camiones');
    expect(b.subtitulo).toBe('8 en 2 camiones · 2 más esperan que Bodega las termine');
    expect(b.accion?.id).toBe('ver-camiones');
  });

  it('todo asignado: revisar y cerrar', () => {
    const b = bandaTablero({ ...base, poolCount: 9, asignadasCount: 9, camionesConAsig: 2 }, seco);
    expect(b).toMatchObject({ paso: 3, titular: 'Todo asignado: revisa y cierra los 2 camiones', accion: { id: 'ver-camiones' } });
  });

  it('cerrando: cuántos faltan', () => {
    const b = bandaTablero({ ...base, poolCount: 9, asignadasCount: 9, camionesConAsig: 4, cerradasCount: 1 }, seco);
    expect(b).toMatchObject({ paso: 4, titular: 'Faltan 3 camiones por cerrar', subtitulo: '1 de 4 cerrados' });
  });

  it('todos cerrados: terminar el día', () => {
    const b = bandaTablero({ ...base, poolCount: 9, asignadasCount: 9, camionesConAsig: 2, cerradasCount: 2 }, seco);
    expect(b).toMatchObject({ paso: 5, titular: 'Todos los camiones cerrados', accion: { id: 'terminar-dia' } });
  });

  it('día cerrado: ver manifiestos', () => {
    const b = bandaTablero({ ...base, poolCount: 9, asignadasCount: 9, camionesConAsig: 2, cerradasCount: 2, diaCerrado: true }, seco);
    expect(b).toMatchObject({ paso: 5, titular: 'Día terminado', accion: { id: 'ver-manifiestos' } });
  });

  it('el paso es siempre el de faseEnrutador mientras no hay cierre', () => {
    for (const i of [
      { ...base, poolCount: 4, listasSinAsignar: 4 },
      { ...base, poolCount: 4, asignadasCount: 2, camionesConAsig: 1, listasSinAsignar: 2 },
      { ...base, poolCount: 4, asignadasCount: 4, camionesConAsig: 1 },
    ]) expect(bandaTablero(i, seco).paso).toBeGreaterThanOrEqual(1);
  });
});

describe('bandaTablero (Congelados)', () => {
  it('no ofrece asignar ni terminar el día: son acciones del seco', () => {
    expect(bandaTablero({ ...base }, cong).accion).toBeNull();
    expect(bandaTablero({ ...base, poolCount: 5, listasSinAsignar: 5 }, cong).accion).toBeNull();
    expect(bandaTablero({ ...base, poolCount: 5, asignadasCount: 5, camionesConAsig: 2, cerradasCount: 2 }, cong).accion).toBeNull();
  });
  it('sí lleva a los camiones para cerrarlos', () => {
    expect(bandaTablero({ ...base, poolCount: 5, asignadasCount: 5, camionesConAsig: 2 }, cong).accion?.id).toBe('ver-camiones');
  });
});

describe('bandaSegundaVuelta', () => {
  it('sin pendientes', () => {
    expect(bandaSegundaVuelta({ pendientes: 0, dias: 0 }).titular).toBe('Sin pendientes de 2ª vuelta');
  });
  it('con pendientes de uno o varios días', () => {
    expect(bandaSegundaVuelta({ pendientes: 3, dias: 1 }).titular).toBe('3 tiendas de un día anterior sin camión');
    expect(bandaSegundaVuelta({ pendientes: 1, dias: 2 }).titular).toBe('1 tienda de 2 días anteriores sin camión');
  });
});

describe('bandaFija y pasos', () => {
  it('flota, plan y calendario no tienen pasos ni botón', () => {
    for (const s of ['flota', 'plan', 'cal'] as const) expect(bandaFija(s)).toMatchObject({ paso: null, accion: null });
  });
  it('los pasos del diseño son uno por fase', () => {
    expect(PASOS_DIA.length).toBe(FASES.length);
  });
});
