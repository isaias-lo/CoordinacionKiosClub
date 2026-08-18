import { describe, it, expect } from 'vitest';
import { construirItemsCongelados, type SlotCongelado } from '../construirItemsCongelados';

const BASE = {
  cod: '23PEÑ',
  tienda: 'Peñalolén',
  region: 'Metropolitana',
  comuna: 'Peñalolén',
  tipoComuna: 'Urbano',
  ventana: '09:00-12:00',
  fecha: '16/07/2026',
  fechaArmado: '2026-07-16',
};

describe('construirItemsCongelados', () => {
  it('cuentaCC=2/cuentaCN=1 con 2 slots CC + 1 slot CN: ids desde canonical_id, pickingSlotId, tipoCaja, nPalletBulto', () => {
    const slots: SlotCongelado[] = [
      { id: 101, tipo: 'CC', canonical_id: 'CAN-CC-1', seq: 1 },
      { id: 102, tipo: 'CC', canonical_id: 'CAN-CC-2', seq: 2 },
      { id: 201, tipo: 'CN', canonical_id: 'CAN-CN-1', seq: 1 },
    ];
    const items = construirItemsCongelados({ ...BASE, cuentaCC: 2, cuentaCN: 1, slots });

    expect(items).toHaveLength(3);

    const [cc1, cc2, cn1] = items;

    expect(cc1).toMatchObject({
      id: 'CAN-CC-1', tipoCaja: 'CC', nPalletBulto: 'CC1', pickingSlotId: 101,
      tiendaCod: '23PEÑ', tienda: 'Peñalolén', region: 'Metropolitana', comuna: 'Peñalolén',
      tipoComuna: 'Urbano', ventana: '09:00-12:00', fechaArmado: '2026-07-16',
    });
    expect(cc2).toMatchObject({ id: 'CAN-CC-2', tipoCaja: 'CC', nPalletBulto: 'CC2', pickingSlotId: 102 });
    expect(cn1).toMatchObject({ id: 'CAN-CN-1', tipoCaja: 'CN', nPalletBulto: 'CN1', pickingSlotId: 201 });
  });

  it('ajuste hacia arriba: 3 CC con solo 2 slots → el 3er item sin pickingSlotId y con id determinístico', () => {
    const slots: SlotCongelado[] = [
      { id: 101, tipo: 'CC', canonical_id: 'CAN-CC-1' },
      { id: 102, tipo: 'CC', canonical_id: 'CAN-CC-2' },
    ];
    const items = construirItemsCongelados({ ...BASE, cuentaCC: 3, cuentaCN: 0, slots });

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ id: 'CAN-CC-1', pickingSlotId: 101, nPalletBulto: 'CC1' });
    expect(items[1]).toMatchObject({ id: 'CAN-CC-2', pickingSlotId: 102, nPalletBulto: 'CC2' });
    expect(items[2]).toMatchObject({
      id: 'CONG-16072026-23PEÑ-CC-3',
      pickingSlotId: null,
      nPalletBulto: 'CC3',
      tipoCaja: 'CC',
    });
  });

  it('id determinístico es estable entre llamadas (misma fecha/cod/tipo/índice)', () => {
    const items1 = construirItemsCongelados({ ...BASE, cuentaCC: 1, cuentaCN: 0, slots: [] });
    const items2 = construirItemsCongelados({ ...BASE, cuentaCC: 1, cuentaCN: 0, slots: [] });
    expect(items1[0].id).toBe(items2[0].id);
    expect(items1[0].id).toBe('CONG-16072026-23PEÑ-CC-1');
  });

  it('ajuste hacia abajo: 1 CC con 2 slots disponibles → solo 1 item (el primero)', () => {
    const slots: SlotCongelado[] = [
      { id: 101, tipo: 'CC', canonical_id: 'CAN-CC-1' },
      { id: 102, tipo: 'CC', canonical_id: 'CAN-CC-2' },
    ];
    const items = construirItemsCongelados({ ...BASE, cuentaCC: 1, cuentaCN: 0, slots });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'CAN-CC-1', pickingSlotId: 101, nPalletBulto: 'CC1' });
  });

  it('cuentaCC=0 y cuentaCN=0 devuelve []', () => {
    const items = construirItemsCongelados({ ...BASE, cuentaCC: 0, cuentaCN: 0, slots: [] });
    expect(items).toEqual([]);
  });

  it('slot sin canonical_id (null o vacío) genera id determinístico en vez de vacío', () => {
    const slots: SlotCongelado[] = [
      { id: 301, tipo: 'CC', canonical_id: null },
      { id: 302, tipo: 'CC', canonical_id: '' },
    ];
    const items = construirItemsCongelados({ ...BASE, cuentaCC: 2, cuentaCN: 0, slots });
    expect(items[0]).toMatchObject({ id: 'CONG-16072026-23PEÑ-CC-1', pickingSlotId: 301 });
    expect(items[1]).toMatchObject({ id: 'CONG-16072026-23PEÑ-CC-2', pickingSlotId: 302 });
  });

  it('CC y CN se cuentan/emparejan independientemente por tipo (slots mezclados en el array)', () => {
    const slots: SlotCongelado[] = [
      { id: 1, tipo: 'CN', canonical_id: 'CAN-CN-1' },
      { id: 2, tipo: 'CC', canonical_id: 'CAN-CC-1' },
      { id: 3, tipo: 'CN', canonical_id: 'CAN-CN-2' },
    ];
    const items = construirItemsCongelados({ ...BASE, cuentaCC: 1, cuentaCN: 2, slots });
    const cc = items.filter(i => i.tipoCaja === 'CC');
    const cn = items.filter(i => i.tipoCaja === 'CN');
    expect(cc).toHaveLength(1);
    expect(cc[0]).toMatchObject({ id: 'CAN-CC-1', pickingSlotId: 2 });
    expect(cn).toHaveLength(2);
    expect(cn[0]).toMatchObject({ id: 'CAN-CN-1', pickingSlotId: 1 });
    expect(cn[1]).toMatchObject({ id: 'CAN-CN-2', pickingSlotId: 3 });
  });

  it('fechaArmado ausente → null en el item', () => {
    const items = construirItemsCongelados({ ...BASE, fechaArmado: undefined, cuentaCC: 1, cuentaCN: 0, slots: [] });
    expect(items[0].fechaArmado).toBeNull();
  });
});
