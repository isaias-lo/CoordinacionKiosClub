import { describe, it, expect } from 'vitest';
import { categoriaDeTipo, agruparResumenDiario, fechaAISO, resumenParaGrafico, resumenParaTarjetas } from '../despachoResumen';

// [C-01] Las tarjetas de Inicio y el gráfico de la misma pantalla mostraban números distintos del
// mismo día. Ahora salen de la misma agregación; esto lo deja amarrado.
describe('las tarjetas y el gráfico cuentan lo mismo', () => {
  // Un día real: 11/09/2026 tal como lo registró Bodega — 61 pallets, 38 bultos, 52 chocolates.
  const filas = [
    ...Array.from({ length: 61 }, () => ({ fecha: '11/09/2026', tipo: 'Pallet' })),
    ...Array.from({ length: 38 }, () => ({ fecha: '11/09/2026', tipo: 'Bulto' })),
    ...Array.from({ length: 52 }, () => ({ fecha: '11/09/2026', tipo: 'Bulto CH' })),
  ];

  it('el mismo día da los mismos totales en las dos formas', () => {
    const dias = agruparResumenDiario(filas);
    const tarjeta = resumenParaTarjetas(dias, '2026-06-01')[0];
    const grafico = resumenParaGrafico(dias, 7)[0];
    expect(tarjeta.date).toBe(grafico.fechaISO);
    expect(tarjeta.total_pallets).toBe(grafico.pallets);
    expect(tarjeta.total_bultos).toBe(grafico.bultos);
    expect(tarjeta.total_chocolates).toBe(grafico.chocolates);
    expect(tarjeta.total_contenedores).toBe(grafico.contenedores);
  });

  it('y son las cifras que muestra Bodega, no un subconjunto', () => {
    const t = resumenParaTarjetas(agruparResumenDiario(filas), '2026-06-01')[0];
    expect(t).toMatchObject({ total_pallets: 61, total_bultos: 38, total_chocolates: 52 });
  });
});

describe('resumenParaTarjetas', () => {
  const filas = [
    { fecha: '11/09/2026', tipo: 'Pallet' },
    { fecha: '10/09/2026', tipo: 'Bulto' },
    { fecha: '01/01/2026', tipo: 'Pallet' },
    { fecha: 'basura',     tipo: 'Pallet' },
  ];

  it('deja fuera lo anterior a la ventana pedida', () => {
    const out = resumenParaTarjetas(agruparResumenDiario(filas), '2026-09-01');
    expect(out.map(d => d.date)).toEqual(['2026-09-11', '2026-09-10']);
  });

  it('ordena del día más reciente al más antiguo', () => {
    const out = resumenParaTarjetas(agruparResumenDiario(filas), '2020-01-01');
    expect(out.map(d => d.date)).toEqual(['2026-09-11', '2026-09-10', '2026-01-01']);
  });

  it('descarta las fechas que no se pueden leer en vez de inventarles un día', () => {
    const out = resumenParaTarjetas(agruparResumenDiario(filas), '2020-01-01');
    expect(out.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });

  it('a diferencia del gráfico, conserva los días en cero (la tarjeta cuenta días despachados)', () => {
    const dias = [{ fecha: '11/09/2026', pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 }];
    expect(resumenParaTarjetas(dias, '2026-01-01')).toHaveLength(1);
    expect(resumenParaGrafico(dias, 7)).toHaveLength(0);
  });
});

describe('categoriaDeTipo', () => {
  it('mapea cada tipo a su categoría', () => {
    expect(categoriaDeTipo('Pallet')).toBe('pallets');
    expect(categoriaDeTipo('Contenedor')).toBe('contenedores');
    expect(categoriaDeTipo('Bulto CH')).toBe('chocolates');
    expect(categoriaDeTipo('Chocolate')).toBe('chocolates');
    expect(categoriaDeTipo('Bulto')).toBe('bultos');
  });
});

describe('agruparResumenDiario', () => {
  it('cuenta una fila por unidad, agrupando por fecha (caso 05/08 = 88 pallets)', () => {
    const rows = [
      ...Array.from({ length: 88 }, () => ({ fecha: '05/08/2026', tipo: 'Pallet' })),
      { fecha: '05/08/2026', tipo: 'Bulto CH' },
      { fecha: '04/08/2026', tipo: 'Bulto' },
    ];
    const out = agruparResumenDiario(rows);
    const d5 = out.find(d => d.fecha === '05/08/2026')!;
    expect(d5.pallets).toBe(88);
    expect(d5.chocolates).toBe(1);
    expect(out.find(d => d.fecha === '04/08/2026')!.bultos).toBe(1);
  });
  it('ignora filas sin fecha', () => {
    expect(agruparResumenDiario([{ fecha: '', tipo: 'Pallet' }])).toEqual([]);
  });
});

describe('fechaAISO', () => {
  it('convierte DD/MM/YYYY e ISO', () => {
    expect(fechaAISO('05/08/2026')).toBe('2026-08-05');
    expect(fechaAISO('2026-08-05')).toBe('2026-08-05');
    expect(fechaAISO('basura')).toBe('');
  });
});

describe('resumenParaGrafico', () => {
  it('ordena por fecha desc, descarta días vacíos y limita a n', () => {
    const dias = [
      { fecha: '01/08/2026', pallets: 5, bultos: 0, contenedores: 0, chocolates: 0 },
      { fecha: '03/08/2026', pallets: 0, bultos: 0, contenedores: 0, chocolates: 0 }, // vacío → fuera
      { fecha: '05/08/2026', pallets: 88, bultos: 1, contenedores: 0, chocolates: 2 },
      { fecha: '04/08/2026', pallets: 44, bultos: 0, contenedores: 0, chocolates: 0 },
    ];
    const out = resumenParaGrafico(dias, 7);
    expect(out.map(d => d.fecha)).toEqual(['05/08/2026', '04/08/2026', '01/08/2026']);
    expect(out[0].fechaISO).toBe('2026-08-05');
  });
  it('respeta el límite n', () => {
    const dias = ['01','02','03','04'].map(d => ({ fecha: `0${d[1]}/08/2026`, pallets: 1, bultos: 0, contenedores: 0, chocolates: 0 }));
    expect(resumenParaGrafico(dias, 2).length).toBe(2);
  });
});
