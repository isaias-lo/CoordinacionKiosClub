import { describe, it, expect } from 'vitest';
import { poolDesdeCalT, type CalTData } from '../poolDespacho';

const d = (o: Partial<CalTData>): CalTData => ({ on: true, p: 0, b: 0, c: 0, ch: 0, ...o });
// La mayoría de los tests no prueban el filtro de "terminada" — les basta con que todos los
// códigos usados estén marcados, así el pool se comporta igual que antes de agregar el filtro.
const TODAS = new Set(['PAL', 'BUL', 'CON', 'CHO', 'VACIA', 'APAGADA', 'T1', '26ALC']);

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
    expect(poolDesdeCalT(calT, TODAS).map(s => s.c).sort()).toEqual(['BUL', 'CHO', 'CON', 'PAL']);
  });

  it('los contenedores suman a p (ocupan piso como un pallet); chocolates van en ch', () => {
    const calT: Record<string, CalTData> = { T1: d({ p: 2, b: 3, c: 1, ch: 4 }) };
    expect(poolDesdeCalT(calT, TODAS)).toEqual([{ c: 'T1', p: 3, b: 3, ch: 4 }]); // p = 2 + 1
  });

  it('una tienda de solo chocolates entra con p=0 y su ch', () => {
    const calT: Record<string, CalTData> = { CHO: d({ ch: 6 }) };
    expect(poolDesdeCalT(calT, TODAS)).toEqual([{ c: 'CHO', p: 0, b: 0, ch: 6 }]);
  });

  it('una tienda de solo contenedores entra ocupando piso (p = contenedores)', () => {
    const calT: Record<string, CalTData> = { CON: d({ c: 2 }) };
    expect(poolDesdeCalT(calT, TODAS)).toEqual([{ c: 'CON', p: 2, b: 0, ch: 0 }]);
  });

  it('el código de la tienda (StoreItem.c, string) no se confunde con contenedores (CalData.c, number)', () => {
    const calT: Record<string, CalTData> = { '26ALC': d({ p: 1, c: 5 }) };
    const [item] = poolDesdeCalT(calT, TODAS);
    expect(item.c).toBe('26ALC');   // código (string)
    expect(item.p).toBe(6);          // 1 pallet + 5 contenedores
  });

  it('calendario vacío → pool vacío', () => {
    expect(poolDesdeCalT({}, TODAS)).toEqual([]);
  });

  it('una tienda con carga pero SIN marcar "Tienda Terminada" no entra al pool', () => {
    const calT: Record<string, CalTData> = { PAL: d({ p: 2 }), BUL: d({ b: 5 }) };
    const soloBul = new Set(['BUL']); // PAL tiene carga pero Bodega no la marcó terminada
    expect(poolDesdeCalT(calT, soloBul).map(s => s.c)).toEqual(['BUL']);
  });

  it('sin ninguna tienda terminada, el pool queda vacío aunque haya carga', () => {
    const calT: Record<string, CalTData> = { PAL: d({ p: 2 }) };
    expect(poolDesdeCalT(calT, new Set())).toEqual([]);
  });
});
