import { describe, it, expect } from 'vitest';
import { buildCongeladosRows, type CongeladoItem, type CongeladosMeta } from '../sheetsCongelados';

const META: CongeladosMeta = { fecha: '16/07/2026', supervisor: 'Juan Pérez' };

const ITEM_CC: CongeladoItem = {
  id: '1-23PEÑ-CC',
  tiendaCod: '23PEÑ',
  tienda: 'Peñalolén',
  tipoCaja: 'CC',
  region: 'Metropolitana',
  comuna: 'Peñalolén',
  tipoComuna: 'Urbano',
  ventana: '09:00-12:00',
  nPalletBulto: 'CC1',
  pickingSlotId: 488,
};

const ITEM_CN: CongeladoItem = {
  id: '2-48BRU-CN',
  tiendaCod: '48BRU',
  tienda: 'Bruselas',
  tipoCaja: 'CN',
  region: 'Metropolitana',
  comuna: 'Maipú',
  tipoComuna: 'Extraurbano',
  ventana: '14:00-17:00',
  nPalletBulto: 'CN1',
  pickingSlotId: null,
  fechaArmado: '2026-07-16',
};

describe('buildCongeladosRows', () => {
  it('lista vacía devuelve []', () => {
    expect(buildCongeladosRows([], META)).toEqual([]);
  });

  it('genera 30 columnas exactas por fila', () => {
    const rows = buildCongeladosRows([ITEM_CC, ITEM_CN], META);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toHaveLength(30);
  });

  it('caja CC: TIPO="Caja Cartón", REGIMEN/CARGA/ESTADO y demás campos en su lugar', () => {
    const [row] = buildCongeladosRows([ITEM_CC], META);
    expect(row[0]).toBe('1-23PEÑ-CC');       // ID
    expect(row[1]).toBe('16/07/2026');       // FECHA
    expect(row[2]).toBe('23PEÑ');            // COD
    expect(row[3]).toBe('Peñalolén');        // TIENDA
    expect(row[4]).toBe('Caja Cartón');      // TIPO
    expect(row[5]).toBe('Congelado');        // REGIMEN
    expect(row[6]).toBe('');                 // TRANSPORTE
    expect(row[7]).toBe('');                 // PATENTE
    expect(row[8]).toBe('Congelados');       // CARGA
    expect(row[9]).toBe('Metropolitana');    // REGION
    expect(row[10]).toBe('Peñalolén');       // COMUNA
    expect(row[11]).toBe('Urbano');          // TIPO_COMUNA
    expect(row[17]).toBe('09:00-12:00');     // VENTANA
    expect(row[18]).toBe('Registrado');      // ESTADO
    expect(row[19]).toBe('CC1');             // N_PALLET_BULTO
    expect(row[23]).toBe('Juan Pérez');      // SUPERVISOR
    expect(row[28]).toBe('');                // FECHA_ARMADO (no vino) → ''
    expect(row[29]).toBe(488);               // CÓDIGO = pickingSlotId
  });

  it('caja CN: TIPO="Caja Negra"', () => {
    const [row] = buildCongeladosRows([ITEM_CN], META);
    expect(row[4]).toBe('Caja Negra');
    expect(row[19]).toBe('CN1');
  });

  it('índices 12-16 (PESO_KG, ALTO, LARGO, ANCHO, PESO_V) siempre vacíos', () => {
    const rows = buildCongeladosRows([ITEM_CC, ITEM_CN], META);
    for (const row of rows) {
      for (let i = 12; i <= 16; i++) expect(row[i]).toBe('');
    }
  });

  it('índices 6,7,20,21,22,24,25,26,27 siempre vacíos (transporte/patente/llegada/conductor/ruta/guia/valor/pionetas)', () => {
    const rows = buildCongeladosRows([ITEM_CC, ITEM_CN], META);
    for (const row of rows) {
      for (const i of [6, 7, 20, 21, 22, 24, 25, 26, 27]) expect(row[i]).toBe('');
    }
  });

  it('fechaArmado ISO presente se formatea a DD/MM/YYYY en col 28', () => {
    const [row] = buildCongeladosRows([ITEM_CN], META);
    expect(row[28]).toBe('16/07/2026');
  });

  it('fechaArmado ausente deja col 28 vacía', () => {
    const [row] = buildCongeladosRows([ITEM_CC], META);
    expect(row[28]).toBe('');
  });

  it('pickingSlotId null deja col 29 (CÓDIGO) vacía', () => {
    const [row] = buildCongeladosRows([{ ...ITEM_CC, pickingSlotId: null }], META);
    expect(row[29]).toBe('');
  });

  it('preserva el orden de items → filas', () => {
    const rows = buildCongeladosRows([ITEM_CN, ITEM_CC], META);
    expect(rows[0][0]).toBe(ITEM_CN.id);
    expect(rows[1][0]).toBe(ITEM_CC.id);
  });
});
