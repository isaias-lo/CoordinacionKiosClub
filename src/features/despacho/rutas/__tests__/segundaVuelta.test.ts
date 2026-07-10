import { describe, it, expect } from 'vitest';
import { derivarPendientesV2, ddmmToISO } from '../utils/segundaVuelta';

describe('ddmmToISO', () => {
  it('convierte DD/MM/YYYY → YYYY-MM-DD', () => {
    expect(ddmmToISO('09/07/2026')).toBe('2026-07-09');
  });
  it('devuelve null si el formato no calza', () => {
    expect(ddmmToISO('2026-07-09')).toBeNull();
    expect(ddmmToISO('')).toBeNull();
  });
});

describe('derivarPendientesV2', () => {
  const HOY = '2026-07-10';

  it('agrupa por (cod, fecha) y cuenta p/b/ch por tipo', () => {
    const rows = [
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Bulto CH' },
      { cod: '02SCL', fecha: '09/07/2026', tipo: 'Bulto' },
    ];
    const out = derivarPendientesV2(rows, 'rm', HOY);
    const phu = out.find(p => p.c === '30PHU')!;
    expect(phu).toMatchObject({ c: '30PHU', p: 3, ch: 1, fechaOrigen: '2026-07-09', grupo: 'rm' });
    expect(out.find(p => p.c === '02SCL')).toMatchObject({ b: 1 });
  });

  it('separa el MISMO cod por día (no suma entre fechas)', () => {
    const rows = [
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '09/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '07/07/2026', tipo: 'Pallet' },
      { cod: '30PHU', fecha: '07/07/2026', tipo: 'Pallet' },
    ];
    const out = derivarPendientesV2(rows, 'rm', HOY).sort((a, b) => a.fechaOrigen.localeCompare(b.fechaOrigen));
    expect(out.map(p => [p.fechaOrigen, p.p])).toEqual([['2026-07-07', 2], ['2026-07-09', 3]]);
  });

  it('excluye HOY (hoy es 1ª vuelta), incluye días pasados', () => {
    const rows = [
      { cod: 'A', fecha: '10/07/2026', tipo: 'Pallet' },   // hoy → fuera
      { cod: 'C', fecha: '09/07/2026', tipo: 'Pallet' },   // pasado → dentro
    ];
    const out = derivarPendientesV2(rows, 'rm', HOY);
    expect(out.map(p => p.c)).toEqual(['C']);
  });

  it('regiones lleva grupo "fal" (para registrar de vuelta en despacho_regiones)', () => {
    const out = derivarPendientesV2([{ cod: '80REG', fecha: '09/07/2026', tipo: 'Pallet' }], 'fal', HOY);
    expect(out[0].grupo).toBe('fal');
  });

  it('ignora fechas mal formadas y pendientes en cero', () => {
    const rows = [
      { cod: 'X', fecha: 'basura', tipo: 'Pallet' },
      { cod: 'Y', fecha: '09/07/2026', tipo: 'Desconocido' }, // no suma p/b/ch → se descarta
    ];
    expect(derivarPendientesV2(rows, 'rm', HOY)).toEqual([]);
  });
});
