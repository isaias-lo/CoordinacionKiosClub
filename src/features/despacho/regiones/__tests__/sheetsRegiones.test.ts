import { describe, it, expect } from 'vitest';
import { buildRows } from '../utils/sheetsRegiones';
import type { DispatchItem } from '../../../../types';

// Columnas relevantes (0-based): 0=ID, 1=FECHA, 28=FECHA_ARMADO
const COL_ID = 0;
const COL_FECHA = 1;
const COL_FECHA_ARMADO = 28;

const baseItem: DispatchItem = {
  orden: 'pallet1',
  tipo: 'hogar',
  pkg: 'pallet',
  guia: '',
  valor: 0,
  peso: 100,
  alto: 120,
  ancho: 100,
  largo: 120,
};

describe('sheetsRegiones buildRows — [P4] fecha de registro', () => {
  const dispatchData = { 'Temuco': [baseItem] };
  const despacho = '2026-06-30'; // mañana
  const armado   = '2026-06-29'; // hoy

  it('la columna FECHA usa la fecha de ARMADO (no la de despacho)', () => {
    const rows = buildRows(dispatchData, 'Carga', despacho, armado);
    expect(rows).toHaveLength(1);
    expect(rows[0][COL_FECHA]).toBe('29/06/2026');
  });

  it('la columna FECHA_ARMADO también refleja el armado', () => {
    const rows = buildRows(dispatchData, 'Carga', despacho, armado);
    expect(rows[0][COL_FECHA_ARMADO]).toBe('29/06/2026');
  });

  it('el ID mantiene el stamp de DESPACHO (idempotencia del registro)', () => {
    const rows = buildRows(dispatchData, 'Carga', despacho, armado);
    expect(String(rows[0][COL_ID])).toContain('30062026');
    expect(rows[0][COL_ID]).toBe('P128TEM30062026P');
  });

  it('sin fecha de armado, FECHA cae a hoy', () => {
    const rows = buildRows(dispatchData, 'Carga', despacho);
    const now = new Date();
    const hoy = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    expect(rows[0][COL_FECHA]).toBe(hoy);
  });
});
