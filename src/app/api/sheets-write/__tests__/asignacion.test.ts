import { describe, it, expect } from 'vitest';
import { clavesConPatente } from '../asignacion';

describe('clavesConPatente', () => {
  it('devuelve solo las tiendas con patente, sin duplicar (fecha, cod)', () => {
    const records = [
      { fecha: '30/07/2026', cod: '18FLO', patente: 'ABCD12' },
      { fecha: '30/07/2026', cod: '18FLO', patente: 'ABCD12' }, // otra línea, misma tienda
      { fecha: '30/07/2026', cod: '09LEO', patente: '' },        // sin patente (LEO)
      { fecha: '30/07/2026', cod: '34SMB', patente: 'WXYZ99' },
    ];
    const out = clavesConPatente(records);
    expect(out).toEqual([
      { fecha: '30/07/2026', cod: '18FLO' },
      { fecha: '30/07/2026', cod: '34SMB' },
    ]);
  });

  it('ignora patente en blanco/espacios y campos faltantes', () => {
    expect(clavesConPatente([{ fecha: '30/07/2026', cod: 'X', patente: '   ' }])).toEqual([]);
    expect(clavesConPatente([{ cod: 'X', patente: 'AB12' }])).toEqual([]); // sin fecha
    expect(clavesConPatente([])).toEqual([]);
  });

  it('la misma tienda en dos fechas distintas cuenta dos claves', () => {
    const out = clavesConPatente([
      { fecha: '29/07/2026', cod: '49PTA', patente: 'AA11' },
      { fecha: '30/07/2026', cod: '49PTA', patente: 'AA11' },
    ]);
    expect(out).toHaveLength(2);
  });
});
