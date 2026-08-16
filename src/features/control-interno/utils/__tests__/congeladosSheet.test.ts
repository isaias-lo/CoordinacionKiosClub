import { describe, it, expect } from 'vitest';
import { fmtCod, serializeCongeladosSheet, HEADER_ROW } from '../congeladosSheet';
import type { CalRecord } from '@/lib/calendarioCongeladosSync';

function calVacio(): CalRecord {
  return {
    LU: { rm: [], costa: [], fal: [] },
    MA: { rm: [], costa: [], fal: [] },
    MI: { rm: [], costa: [], fal: [] },
    JU: { rm: [], costa: [], fal: [] },
    VI: { rm: [], costa: [], fal: [] },
    SA: { rm: [], costa: [], fal: [] },
    DO: { rm: [], costa: [], fal: [] },
  };
}

describe('fmtCod', () => {
  it('separa dígitos iniciales del resto con un espacio', () => {
    expect(fmtCod('16PQA')).toBe('16 PQA');
    expect(fmtCod('01TPS')).toBe('01 TPS');
  });

  it('normaliza PEN → PEÑ y VIN → VIÑ', () => {
    expect(fmtCod('23PEN')).toBe('23 PEÑ');
    expect(fmtCod('05VIN')).toBe('05 VIÑ');
  });

  it('devuelve el código tal cual si no matchea el patrón', () => {
    expect(fmtCod('SINCOD')).toBe('SINCOD');
    expect(fmtCod('')).toBe('');
  });
});

describe('serializeCongeladosSheet', () => {
  it('headerRow tiene los 7 días LU..DO mapeados a 7 columnas (B..H)', () => {
    const { headerRow } = serializeCongeladosSheet(calVacio());
    expect(headerRow).toEqual(['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO']);
    expect(headerRow).toBe(HEADER_ROW);
    expect(headerRow).toHaveLength(7);
  });

  it('calendario vacío → dataRows vacío y numRows 0', () => {
    const { dataRows, numRows } = serializeCongeladosSheet(calVacio());
    expect(dataRows).toEqual([]);
    expect(numRows).toBe(0);
  });

  it('aplana un día con códigos en varios grupos en orden rm, costa, fal', () => {
    const cal = calVacio();
    cal.LU = { rm: ['16PQA'], costa: ['05VIN'], fal: ['23PEN'] };
    const { dataRows, numRows } = serializeCongeladosSheet(cal);
    expect(numRows).toBe(3);
    // Columna LU es la primera (índice 0) de cada fila de dataRows.
    expect(dataRows[0][0]).toBe('16 PQA'); // rm
    expect(dataRows[1][0]).toBe('05 VIÑ'); // costa
    expect(dataRows[2][0]).toBe('23 PEÑ'); // fal
  });

  it('días de distinto largo → transpuesto con relleno "" para los días más cortos', () => {
    const cal = calVacio();
    cal.LU = { rm: ['16PQA', '20CTC'], costa: [], fal: [] };
    cal.MA = { rm: ['01TPS'], costa: [], fal: [] };
    const { dataRows, numRows } = serializeCongeladosSheet(cal);
    expect(numRows).toBe(2);
    // Fila 0: LU tiene código, MA tiene código.
    expect(dataRows[0][0]).toBe('16 PQA');
    expect(dataRows[0][1]).toBe('01 TPS');
    // Fila 1: LU tiene segundo código, MA ya no tiene más → ''.
    expect(dataRows[1][0]).toBe('20 CTC');
    expect(dataRows[1][1]).toBe('');
    // Los días sin códigos (MI..DO) quedan '' en ambas filas.
    for (const row of dataRows) {
      expect(row).toHaveLength(7);
      expect(row.slice(2)).toEqual(['', '', '', '', '']);
    }
  });

  it('cada fila de dataRows tiene exactamente 7 columnas (una por día, sin col A)', () => {
    const cal = calVacio();
    cal.DO = { rm: [], costa: [], fal: ['41ANA'] };
    const { dataRows } = serializeCongeladosSheet(cal);
    expect(dataRows).toHaveLength(1);
    expect(dataRows[0]).toHaveLength(7);
    expect(dataRows[0][6]).toBe('41 ANA'); // DO es la última columna (índice 6 = H)
  });
});
