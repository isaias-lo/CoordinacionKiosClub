import { describe, it, expect } from 'vitest';
import { bandaTablero, bandaCongelados, bandaSegundaVuelta, bandaFija, diaSemana, bandaFlota, listaPatentes, PASOS_DIA, PASOS_CONGELADOS, type BandaTableroInput } from '../bandaEnrutador';
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
  const v = { pendientes: 5, dias: 2, dia: 'sábado', sinCamion: 0, camiones: 0 };
  it('sin pendientes', () => {
    expect(bandaSegundaVuelta({ ...v, pendientes: 0, dias: 0 })).toMatchObject({ titular: 'Sin pendientes de 2ª vuelta', accion: null });
  });
  it('tiendas del día elegido sin camión: lo dice, sin botón (no hay asignación automática)', () => {
    const b = bandaSegundaVuelta({ ...v, sinCamion: 3, camiones: 1 });
    expect(b.titular).toBe('3 tiendas del sábado sin camión');
    expect(b.subtitulo).toBe('Al cerrar, cada camión se registra como 2ª vuelta de hoy, con su manifiesto, bajo la fecha del sábado');
    expect(b.accion).toBeNull();
    expect(bandaSegundaVuelta({ ...v, sinCamion: 1 }).titular).toBe('1 tienda del sábado sin camión');
  });
  it('todo asignado: lleva a cerrar', () => {
    expect(bandaSegundaVuelta({ ...v, camiones: 2 })).toMatchObject({
      titular: 'Todo lo del sábado va en camión: revisa y cierra los 2 camiones',
      accion: { id: 'cerrar-camiones', texto: 'Cerrar los 2 camiones' },
    });
    expect(bandaSegundaVuelta({ ...v, camiones: 1 }).accion?.texto).toBe('Cerrar el camión');
  });
  it('no tiene pasos', () => {
    expect(bandaSegundaVuelta({ ...v, sinCamion: 2 }).paso).toBeNull();
  });
});

describe('diaSemana', () => {
  it('nombra el día', () => {
    expect(diaSemana('2026-10-03')).toBe('sábado');
    expect(diaSemana('raro')).toBe('raro');
  });
});

describe('bandaFija y pasos', () => {
  it('flota, plan y calendario no tienen pasos ni botón', () => {
    for (const s of ['plan', 'cal'] as const) expect(bandaFija(s)).toMatchObject({ paso: null, accion: null });
  });
  it('los pasos del diseño son uno por fase', () => {
    expect(PASOS_DIA.length).toBe(FASES.length);
  });
});

describe('bandaCongelados', () => {
  const c = { ...base, bultosAsignados: 0 };
  it('sin cajas de Bodega Congelados: espera, sin botón', () => {
    expect(bandaCongelados(c)).toMatchObject({ paso: 1, titular: 'Esperando a Bodega Congelados', accion: null });
  });
  it('habla de furgones y usa sus propios pasos', () => {
    const b = bandaCongelados({ ...c, poolCount: 9, asignadasCount: 9, camionesConAsig: 2, bultosAsignados: 31 });
    expect(b.pasos).toBe(PASOS_CONGELADOS);
    expect(b.titular).toBe('Todo asignado: revisa y cierra los 2 furgones');
    expect(b.subtitulo).toBe('9 tiendas · 31 bultos');
    expect(b.accion).toEqual({ id: 'cerrar-camiones', texto: 'Cerrar los 2 furgones' });
  });
  it('un solo furgón: singular', () => {
    const b = bandaCongelados({ ...c, poolCount: 3, asignadasCount: 3, camionesConAsig: 1, bultosAsignados: 1 });
    expect(b.titular).toBe('Todo asignado: revisa y cierra el furgón');
    expect(b.subtitulo).toBe('3 tiendas · 1 bulto');
    expect(b.accion?.texto).toBe('Cerrar el furgón');
  });
  it('tiendas sin furgón: no hay asignación automática, no ofrece botón', () => {
    const b = bandaCongelados({ ...c, poolCount: 5, asignadasCount: 2, camionesConAsig: 1, listasSinAsignar: 3 });
    expect(b).toMatchObject({ paso: 2, titular: 'Faltan 3 tiendas por asignar', accion: null });
    expect(b.subtitulo).toBe('2 ya van en 1 furgón · arrástralas a un furgón');
  });
  it('cerrando: ofrece cerrar los que faltan', () => {
    const b = bandaCongelados({ ...c, poolCount: 9, asignadasCount: 9, camionesConAsig: 4, cerradasCount: 1 });
    expect(b).toMatchObject({ paso: 4, titular: 'Faltan 3 furgones por cerrar', subtitulo: '1 de 4 cerrados' });
    expect(b.accion).toEqual({ id: 'cerrar-camiones', texto: 'Cerrar los 3 que faltan' });
    expect(bandaCongelados({ ...c, poolCount: 9, asignadasCount: 9, camionesConAsig: 2, cerradasCount: 1 }).accion?.texto).toBe('Cerrar el que falta');
  });
  it('todos cerrados: no termina el día (eso es de Despacho)', () => {
    const b = bandaCongelados({ ...c, poolCount: 9, asignadasCount: 9, camionesConAsig: 2, cerradasCount: 2, bultosAsignados: 31 });
    expect(b).toMatchObject({ paso: 5, titular: 'Todos los furgones cerrados', accion: null });
    expect(b.subtitulo).toBe('2 furgones · 31 bultos · el día lo termina Despacho');
  });
  it('ignora un diaCerrado que le llegue: terminar el día no ocurre en este tablero', () => {
    expect(bandaCongelados({ ...c, poolCount: 3, listasSinAsignar: 3, diaCerrado: true }).paso).toBe(1);
  });
});

describe('bandaFlota', () => {
  const f = { sub: 'gestionar' as const, rutas: 4, sinConductor: [] as string[], encendidos: 5, vehiculos: 6 };
  it('rutas sin conductor: las nombra y lleva a la primera', () => {
    const b = bandaFlota({ ...f, sinConductor: ['SPJP88', 'PTFZ21'] });
    expect(b.titular).toBe('2 camiones todavía no tienen conductor');
    expect(b.subtitulo).toBe('SPJP88 y PTFZ21 · asígnalos antes de que salgan');
    expect(b.accion).toEqual({ id: 'ir-sin-conductor', texto: 'Ir al primero sin conductor' });
    expect(bandaFlota({ ...f, sinConductor: ['SPJP88'] })).toMatchObject({
      titular: '1 camión todavía no tiene conductor', subtitulo: 'SPJP88 · asígnalo antes de que salgan',
    });
  });
  it('todos con conductor, sin rutas o cargando: sin botón', () => {
    expect(bandaFlota(f)).toMatchObject({ titular: 'Todos los camiones tienen conductor', subtitulo: '4 rutas listas para salir', accion: null });
    expect(bandaFlota({ ...f, rutas: 0 }).titular).toBe('Todavía no hay rutas registradas');
    expect(bandaFlota({ ...f, rutas: null }).titular).toBe('Cargando las rutas del día');
  });
  it('las otras secciones dicen qué son', () => {
    expect(bandaFlota({ ...f, sub: 'vehiculos' }).titular).toBe('5 de 6 vehículos encendidos');
    expect(bandaFlota({ ...f, sub: 'personal' }).titular).toBe('Conductores y pionetas');
    expect(bandaFlota({ ...f, sub: 'salidas' }).accion).toBeNull();
  });
});

describe('listaPatentes', () => {
  it('une con «y» y resume las que sobran', () => {
    expect(listaPatentes([])).toBe('');
    expect(listaPatentes(['A'])).toBe('A');
    expect(listaPatentes(['A', 'B', 'C'])).toBe('A, B y C');
    expect(listaPatentes(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C y 2 más');
  });
});
