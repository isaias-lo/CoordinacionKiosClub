import { describe, it, expect } from 'vitest';
import { pendientesDelDia, unirBacklog, textoBacklog, ruteadasParaOrigen } from '../backlogSegundaVuelta';

// El lunes 14/09 real: 9 tiendas registradas que no entraron a ningún manifiesto.
const CARGA_14 = [
  { cod: '02SCL', pallets: 3, bultos: 2, contenedores: 0, chocolates: 4 },
  { cod: '05LP',  pallets: 4, bultos: 3, contenedores: 0, chocolates: 0 },
  { cod: '06MQH', pallets: 3, bultos: 3, contenedores: 0, chocolates: 0 },
  { cod: '12LAS', pallets: 3, bultos: 0, contenedores: 0, chocolates: 0 },
  { cod: '47PTV', pallets: 3, bultos: 2, contenedores: 0, chocolates: 0 },
  { cod: '50PTM', pallets: 4, bultos: 1, contenedores: 0, chocolates: 0 },
  { cod: '52MUT', pallets: 2, bultos: 0, contenedores: 0, chocolates: 4 },
  { cod: '53VAL', pallets: 3, bultos: 2, contenedores: 0, chocolates: 0 },
  { cod: '57CAS', pallets: 3, bultos: 2, contenedores: 0, chocolates: 0 },
];

describe('el caso real del lunes 14', () => {
  it('encuentra las 9 sin que nadie haya cerrado el día', () => {
    const r = pendientesDelDia(CARGA_14, new Set(), '2026-09-14');
    expect(r).toHaveLength(9);
    expect(r.map(x => x.c)).toEqual(
      ['02SCL','05LP','06MQH','12LAS','47PTV','50PTM','52MUT','53VAL','57CAS']);
  });

  it('suma 28 pallets, 15 bultos y 8 chocolates', () => {
    const r = pendientesDelDia(CARGA_14, new Set(), '2026-09-14');
    expect(r.reduce((s, x) => s + x.p, 0)).toBe(28);
    expect(r.reduce((s, x) => s + x.b, 0)).toBe(15);
    expect(r.reduce((s, x) => s + x.ch, 0)).toBe(8);
  });

  it('las que SÍ salieron en un manifiesto no son pendientes', () => {
    const r = pendientesDelDia(CARGA_14, new Set(['02SCL', '05LP']), '2026-09-14');
    expect(r.map(x => x.c)).not.toContain('02SCL');
    expect(r).toHaveLength(7);
  });

  it('marca la fecha de origen: el backlog se agrupa por día', () => {
    expect(pendientesDelDia(CARGA_14, new Set(), '2026-09-14')[0].fechaOrigen).toBe('2026-09-14');
  });
});

describe('qué cuenta como pendiente', () => {
  it('un contenedor ocupa piso como un pallet', () => {
    const [r] = pendientesDelDia([{ cod: 'A', pallets: 1, bultos: 0, contenedores: 2 }], new Set(), 'd');
    expect(r.p).toBe(3);
  });

  it('carga en CERO no es pendiente aunque tenga fila', () => {
    expect(pendientesDelDia([{ cod: 'A', pallets: 0, bultos: 0 }], new Set(), 'd')).toEqual([]);
  });

  it('solo chocolates ya la hace pendiente', () => {
    expect(pendientesDelDia([{ cod: 'A', pallets: 0, bultos: 0, chocolates: 2 }], new Set(), 'd')).toHaveLength(1);
  });

  it('una fila sin código se ignora', () => {
    expect(pendientesDelDia([{ cod: '', pallets: 3, bultos: 0 }], new Set(), 'd')).toEqual([]);
  });

  it('normaliza el código antes de comparar con las ruteadas', () => {
    expect(pendientesDelDia([{ cod: ' 02scl ', pallets: 3, bultos: 0 }], new Set(['02SCL']), 'd')).toEqual([]);
  });
});

describe('unirBacklog — lo guardado manda', () => {
  const g = [{ c: 'A', p: 9, b: 9, ch: 9, fechaOrigen: 'd1' }];
  const c = [{ c: 'A', p: 1, b: 1, ch: 1, fechaOrigen: 'd1' }, { c: 'B', p: 2, b: 0, ch: 0, fechaOrigen: 'd1' }];

  it('una decisión ya registrada no se pisa con el cálculo', () => {
    const r = unirBacklog(g, c);
    expect(r.find(x => x.c === 'A')?.p).toBe(9);
  });

  it('pero lo que nadie registró SÍ entra — es el caso que se arregla', () => {
    expect(unirBacklog(g, c).map(x => x.c).sort()).toEqual(['A', 'B']);
  });

  it('la misma tienda en OTRO día es otra pendiente', () => {
    const otro = [{ c: 'A', p: 1, b: 1, ch: 1, fechaOrigen: 'd2' }];
    expect(unirBacklog(g, otro)).toHaveLength(2);
  });

  it('sin nada guardado devuelve el cálculo entero', () => {
    expect(unirBacklog([], c)).toEqual(c);
  });
});

describe('textoBacklog', () => {
  it('cuenta tiendas y días', () => {
    expect(textoBacklog([
      { c: 'A', p: 1, b: 0, ch: 0, fechaOrigen: 'd1' },
      { c: 'B', p: 1, b: 0, ch: 0, fechaOrigen: 'd1' },
      { c: 'C', p: 1, b: 0, ch: 0, fechaOrigen: 'd2' },
    ])).toBe('3 tiendas de 2 días');
  });

  it('singular cuando corresponde', () => {
    expect(textoBacklog([{ c: 'A', p: 1, b: 0, ch: 0, fechaOrigen: 'd1' }])).toBe('1 tienda de 1 día');
  });

  it('vacío cuando no hay nada', () => {
    expect(textoBacklog([])).toBe('');
  });
});

describe('ruteadasParaOrigen — el falso positivo que resucitaba despachadas', () => {
  // Septiembre real: las del 09 salieron entre el 10 y el 14; mirar solo el mismo día las
  // marcaba pendientes otra vez. De 28 "pendientes", 15 eran falsos.
  const MANIF = [
    { fecha: '2026-09-10', cods: ['01TPS', '02SCL', '05LP', '13PIE', '19SUB'] },
    { fecha: '2026-09-11', cods: ['20CTC', '32BNV', '35BN2', '39PSB', '26ALC'] },
    { fecha: '2026-09-14', cods: ['41ANA', '42ANP', '30PHU', '58TAM'] },
  ];

  it('una tienda despachada DÍAS DESPUÉS ya no es pendiente', () => {
    const r = ruteadasParaOrigen(MANIF, '2026-09-09');
    for (const c of ['01TPS', '20CTC', '41ANA']) expect(r.has(c)).toBe(true);
  });

  it('las 11 del 09 dejan de aparecer', () => {
    const carga = ['01TPS','02SCL','05LP','13PIE','19SUB','20CTC','32BNV','35BN2','39PSB','41ANA','42ANP']
      .map(cod => ({ cod, pallets: 3, bultos: 1 }));
    expect(pendientesDelDia(carga, ruteadasParaOrigen(MANIF, '2026-09-09'), '2026-09-09')).toEqual([]);
  });

  it('del 10 quedan SOLO las 4 que de verdad no salieron', () => {
    const carga = ['04PDG','26ALC','30PHU','47PTV','50PTM','53VAL','57CAS','58TAM']
      .map(cod => ({ cod, pallets: 3, bultos: 1 }));
    const r = pendientesDelDia(carga, ruteadasParaOrigen(MANIF, '2026-09-10'), '2026-09-10');
    expect(r.map(x => x.c)).toEqual(['04PDG', '47PTV', '50PTM', '53VAL', '57CAS']);
  });

  it('un manifiesto ANTERIOR al día de origen no cuenta: esa carga es otra', () => {
    const r = ruteadasParaOrigen([{ fecha: '2026-09-08', cods: ['01TPS'] }], '2026-09-09');
    expect(r.has('01TPS')).toBe(false);
  });

  it('el manifiesto del MISMO día sigue contando', () => {
    expect(ruteadasParaOrigen([{ fecha: '2026-09-09', cods: ['01TPS'] }], '2026-09-09').has('01TPS')).toBe(true);
  });

  it('normaliza y descarta vacíos', () => {
    const r = ruteadasParaOrigen([{ fecha: '2026-09-10', cods: [' 01tps ', '', null as unknown as string] }], '2026-09-09');
    expect([...r]).toEqual(['01TPS']);
  });

  it('sin manifiestos no hay nada ruteado', () => {
    expect(ruteadasParaOrigen([], '2026-09-09').size).toBe(0);
  });
});
