import { describe, it, expect } from 'vitest';
import { poolDesdeCalT, type CalTData } from '../poolDespacho';

const d = (o: Partial<CalTData>): CalTData => ({ on: true, p: 0, b: 0, c: 0, ch: 0, ...o });

describe('poolDesdeCalT', () => {
  it('incluye las tiendas activas con cualquier tipo > 0 y las de solo contenedores/chocolates', () => {
    const calT: Record<string, CalTData> = {
      PAL: d({ p: 2 }),
      BUL: d({ b: 5 }),
      CON: d({ c: 3 }),           // solo contenedores → antes se perdía
      CHO: d({ ch: 4 }),          // solo chocolates → antes se perdía (31% de bodega)
      VACIA: d({}),               // sin carga → fuera
      APAGADA: d({ on: false, p: 9 }),
    };
    expect(poolDesdeCalT(calT).map(s => s.c).sort()).toEqual(['BUL', 'CHO', 'CON', 'PAL']);
  });

  it('los contenedores suman a p (ocupan piso como un pallet); chocolates van en ch', () => {
    const calT: Record<string, CalTData> = { T1: d({ p: 2, b: 3, c: 1, ch: 4 }) };
    expect(poolDesdeCalT(calT)).toEqual([{ c: 'T1', p: 3, b: 3, ch: 4 }]); // p = 2 + 1
  });

  it('una tienda de solo chocolates entra con p=0 y su ch', () => {
    const calT: Record<string, CalTData> = { CHO: d({ ch: 6 }) };
    expect(poolDesdeCalT(calT)).toEqual([{ c: 'CHO', p: 0, b: 0, ch: 6 }]);
  });

  it('una tienda de solo contenedores entra ocupando piso (p = contenedores)', () => {
    const calT: Record<string, CalTData> = { CON: d({ c: 2 }) };
    expect(poolDesdeCalT(calT)).toEqual([{ c: 'CON', p: 2, b: 0, ch: 0 }]);
  });

  it('el código de la tienda (StoreItem.c, string) no se confunde con contenedores (CalData.c, number)', () => {
    const calT: Record<string, CalTData> = { '26ALC': d({ p: 1, c: 5 }) };
    const [item] = poolDesdeCalT(calT);
    expect(item.c).toBe('26ALC');   // código (string)
    expect(item.p).toBe(6);          // 1 pallet + 5 contenedores
  });

  it('calendario vacío → pool vacío', () => {
    expect(poolDesdeCalT({})).toEqual([]);
  });
});
