import { describe, it, expect } from 'vitest';
import { buildSheetRow, normalizeHeader } from '../sheetRow';

describe('normalizeHeader', () => {
  it('trim + minúsculas + colapsa espacios', () => {
    expect(normalizeHeader('  Fecha/Hora ')).toBe('fecha/hora');
    expect(normalizeHeader('Pallets   Enviados')).toBe('pallets enviados');
  });
});

describe('buildSheetRow', () => {
  const record = {
    'Fecha/Hora': '25/07/2026 16:30',
    'Código': '29CFL',
    'Tienda': 'Colo Colo',
    'Acuse de recibo': 'Recibí conforme',
  };

  it('alinea cada valor bajo su encabezado (orden de la hoja)', () => {
    const headers = ['Fecha/Hora', 'Código', 'Tienda', 'Acuse de recibo'];
    expect(buildSheetRow(headers, record)).toEqual(['25/07/2026 16:30', '29CFL', 'Colo Colo', 'Recibí conforme']);
  });

  it('respeta el reordenamiento de columnas sin cruzar datos', () => {
    const reordenado = ['Acuse de recibo', 'Tienda', 'Fecha/Hora', 'Código'];
    expect(buildSheetRow(reordenado, record)).toEqual(['Recibí conforme', 'Colo Colo', '25/07/2026 16:30', '29CFL']);
  });

  it('rellena con vacío los encabezados sin dato', () => {
    const headers = ['Fecha/Hora', 'Conductor', 'Código', 'Firma'];
    expect(buildSheetRow(headers, record)).toEqual(['25/07/2026 16:30', '', '29CFL', '']);
  });

  it('ignora datos que no tienen encabezado en la hoja', () => {
    const headers = ['Código', 'Tienda'];
    expect(buildSheetRow(headers, record)).toEqual(['29CFL', 'Colo Colo']);
  });

  it('empareja aunque el encabezado varíe en mayúsculas/espacios', () => {
    const headers = ['  fecha/hora', 'CÓDIGO'];
    expect(buildSheetRow(headers, record)).toEqual(['25/07/2026 16:30', '29CFL']);
  });

  it('respaldo posicional cuando la hoja no tiene encabezados', () => {
    expect(buildSheetRow([], record)).toEqual(['25/07/2026 16:30', '29CFL', 'Colo Colo', 'Recibí conforme']);
  });

  it('convierte null/undefined a vacío', () => {
    const headers = ['A', 'B'];
    expect(buildSheetRow(headers, { A: 0, B: '' })).toEqual([0, '']);
  });
});
