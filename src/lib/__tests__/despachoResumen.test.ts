import { describe, it, expect } from 'vitest';
import { categoriaDeTipo, agruparResumenDiario, fechaAISO, resumenParaGrafico } from '../despachoResumen';

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
