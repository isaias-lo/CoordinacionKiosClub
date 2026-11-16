import { describe, it, expect } from 'vitest';
import {
  agruparPorDia, diasPendientes, detallePendiente, UMBRAL_LLENO,
  type DiaConTrabajo, type DiaEnHoja,
} from '../diasPendientes';

const HOY = '2026-11-16';
const trabajo = (fecha: string, movimientos = 135, tiendas = 31): DiaConTrabajo =>
  ({ fecha, movimientos, tiendas });
const enHoja = (fecha: string, filas: number, conNombre: number): DiaEnHoja =>
  ({ fecha, filas, conNombre, desde: 1, hasta: filas });

describe('diasPendientes: los dos casos reales', () => {
  it('el viernes 13: tuvo trabajo y no está en la hoja', () => {
    const r = diasPendientes([trabajo('2026-11-13', 135, 31)], [], HOY);
    expect(r).toEqual([{ fecha: '2026-11-13', motivo: 'sin-bloque', movimientos: 135, tiendas: 31 }]);
  });

  it('el miércoles 11: el bloque está, pero con 17 de 68', () => {
    const r = diasPendientes([trabajo('2026-11-11', 149, 21)], [enHoja('2026-11-11', 68, 17)], HOY);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe('incompleto');
    expect(r[0].conNombre).toBe(17);
    expect(r[0].filas).toBe(68);
  });
});

describe('diasPendientes: lo que NO se avisa', () => {
  it('un día sin movimientos no es un día pendiente', () => {
    // El sábado 14 tuvo cero. Un aviso que sale todos los lunes por un día que nunca tuvo
    // trabajo se deja de leer, y con él los que sí importan.
    expect(diasPendientes([trabajo('2026-11-14', 0, 0)], [], HOY)).toEqual([]);
  });

  it('HOY nunca se avisa, aunque no esté registrado', () => {
    // Que hoy no esté registrado es lo normal hasta que se cierra el turno.
    expect(diasPendientes([trabajo(HOY, 36, 30)], [], HOY)).toEqual([]);
  });

  it('un día futuro tampoco', () => {
    expect(diasPendientes([trabajo('2026-11-20')], [], HOY)).toEqual([]);
  });

  it('un día bien registrado no aparece', () => {
    // jue 12/11: 88 de 91 = 97%.
    expect(diasPendientes([trabajo('2026-11-12', 151, 29)], [enHoja('2026-11-12', 91, 88)], HOY)).toEqual([]);
  });
});

describe('diasPendientes: el umbral, contra los días reales', () => {
  const sanos: [string, number, number][] = [
    ['2026-11-10', 88, 88],   // 100%
    ['2026-11-06', 88, 87],   //  99%
    ['2026-11-09', 95, 93],   //  98%
    ['2026-11-04', 68, 66],   //  97%
    ['2026-11-12', 91, 88],   //  97%
  ];

  it.each(sanos)('%s con %i filas y %i nombres NO se avisa', (fecha, filas, conNombre) => {
    expect(diasPendientes([trabajo(fecha)], [enHoja(fecha, filas, conNombre)], HOY)).toEqual([]);
  });

  it('el 11/11 con 17 de 68 SÍ se avisa', () => {
    expect(diasPendientes([trabajo('2026-11-11')], [enHoja('2026-11-11', 68, 17)], HOY)).toHaveLength(1);
  });

  it('un día con varias tiendas sin carga pasa igual', () => {
    // Cinco tiendas sin carga dejan 15 filas vacías sobre 95: 84%, por encima del umbral.
    expect(diasPendientes([trabajo('2026-11-05')], [enHoja('2026-11-05', 95, 80)], HOY)).toEqual([]);
  });

  it('el umbral es el 80% y se puede mover para probar', () => {
    expect(UMBRAL_LLENO).toBe(0.8);
    const casi = [enHoja('2026-11-05', 100, 85)];
    expect(diasPendientes([trabajo('2026-11-05')], casi, HOY, 0.9)).toHaveLength(1);
    expect(diasPendientes([trabajo('2026-11-05')], casi, HOY, 0.8)).toEqual([]);
  });

  it('un bloque de cero filas no divide por cero', () => {
    const r = diasPendientes([trabajo('2026-11-05')], [enHoja('2026-11-05', 0, 0)], HOY);
    expect(r).toHaveLength(1);
    expect(r[0].motivo).toBe('incompleto');
  });
});

describe('diasPendientes: el orden', () => {
  it('del más reciente al más viejo', () => {
    const r = diasPendientes(
      [trabajo('2026-11-05'), trabajo('2026-11-13'), trabajo('2026-11-11')], [], HOY);
    expect(r.map(d => d.fecha)).toEqual(['2026-11-13', '2026-11-11', '2026-11-05']);
  });

  it('no depende del orden en que llegan', () => {
    const dias = [trabajo('2026-11-11'), trabajo('2026-11-13')];
    const a = diasPendientes(dias, [], HOY).map(d => d.fecha);
    const b = diasPendientes([...dias].reverse(), [], HOY).map(d => d.fecha);
    expect(a).toEqual(b);
  });
});

describe('detallePendiente', () => {
  it('sin bloque dice el trabajo que quedó afuera', () => {
    expect(detallePendiente({ fecha: '2026-11-13', motivo: 'sin-bloque', movimientos: 135, tiendas: 31 }))
      .toBe('135 movimientos · 31 tiendas');
  });

  it('incompleto dice cuánto falta llenar', () => {
    expect(detallePendiente({ fecha: '2026-11-11', motivo: 'incompleto', movimientos: 149,
      tiendas: 21, filas: 68, conNombre: 17 })).toBe('17 de 68 filas con nombre');
  });

  it('el singular no queda feo', () => {
    expect(detallePendiente({ fecha: '2026-11-13', motivo: 'sin-bloque', movimientos: 1, tiendas: 1 }))
      .toBe('1 movimiento · 1 tienda');
  });
});

describe('agruparPorDia: el bug que mandó una fila por movimiento', () => {
  it('agrupa por día, no por movimiento', () => {
    const r = agruparPorDia([
      { dia: '2026-11-04', origin: 'Abastecimiento Comida 41ANA 04/11/2026' },
      { dia: '2026-11-04', origin: 'Abastecimiento Aseo 41ANA 04/11/2026' },
      { dia: '2026-11-04', origin: 'Abastecimiento Hogar 17MAI 04/11/2026' },
      { dia: '2026-11-03', origin: 'Abastecimiento Comida 05LP 03/11/2026' },
    ]);
    expect(r).toEqual([
      { fecha: '2026-11-04', movimientos: 3, tiendas: 2 },
      { fecha: '2026-11-03', movimientos: 1, tiendas: 1 },
    ]);
  });

  it('una MARCA DE TIEMPO no es un día y se descarta', () => {
    // Es el bug exacto: `odooDateToISO` devuelve «2026-11-04T13:19:46Z» y cada movimiento quedó
    // siendo su propio día. Con esto el resultado queda VACÍO y se nota, en vez de producir una
    // lista larga y creíble de «1 movimiento · 0 tiendas».
    const r = agruparPorDia([
      { dia: '2026-11-04T13:19:46Z', origin: 'Abastecimiento Comida 41ANA' },
      { dia: '2026-11-04T13:16:03Z', origin: 'Abastecimiento Aseo 41ANA' },
    ]);
    expect(r).toEqual([]);
  });

  it('descarta cualquier clave que no sea un día', () => {
    expect(agruparPorDia([{ dia: '' }, { dia: '2026-11' }, { dia: 'hoy' }])).toEqual([]);
  });

  it('un origen sin código de tienda cuenta el movimiento pero no la tienda', () => {
    // «Pack» y «Agregado» no llevan código. El trabajo existe; la tienda no se sabe.
    const r = agruparPorDia([
      { dia: '2026-11-04', origin: 'Pack' },
      { dia: '2026-11-04', origin: 'Abastecimiento Comida 41ANA 04/11/2026' },
    ]);
    expect(r).toEqual([{ fecha: '2026-11-04', movimientos: 2, tiendas: 1 }]);
  });

  it('la misma tienda dos veces cuenta una', () => {
    const r = agruparPorDia([
      { dia: '2026-11-04', origin: 'Abastecimiento Comida 23PEÑ' },
      { dia: '2026-11-04', origin: 'Abastecimiento Aseo 23peñ' },
    ]);
    expect(r[0].tiendas).toBe(1);
  });

  it('del día más reciente al más viejo', () => {
    const r = agruparPorDia([{ dia: '2026-11-02' }, { dia: '2026-11-13' }, { dia: '2026-11-06' }]);
    expect(r.map(d => d.fecha)).toEqual(['2026-11-13', '2026-11-06', '2026-11-02']);
  });

  it('sin movimientos no rompe', () => {
    expect(agruparPorDia([])).toEqual([]);
  });
});
