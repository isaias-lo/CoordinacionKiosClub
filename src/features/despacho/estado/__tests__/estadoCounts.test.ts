import { describe, it, expect } from 'vitest';
import { contarTiendasPorEstado } from '../estadoCounts';

const ESTADOS = ['Registrado', 'Pendiente', 'En camino', 'Entregado', 'Recibido', 'Diferencia'];

describe('contarTiendasPorEstado', () => {
  it('cuenta tiendas distintas, no líneas (9 líneas Recibido de 2 tiendas → 2)', () => {
    const rows = [
      ...Array(6).fill(0).map(() => ({ cod: '23PEÑ', seguimiento: 'Recibido' })),
      ...Array(3).fill(0).map(() => ({ cod: '48BRU', seguimiento: 'Recibido' })),
      ...Array(4).fill(0).map(() => ({ cod: '18FLO', seguimiento: 'Diferencia' })),
    ];
    const { counts, total } = contarTiendasPorEstado(rows, ESTADOS);
    expect(counts['Recibido']).toBe(2);   // 23PEÑ + 48BRU (no 9)
    expect(counts['Diferencia']).toBe(1); // 18FLO (no 4)
    expect(total).toBe(3);                // 3 tiendas distintas
  });

  it('una tienda con líneas en dos estados cuenta en ambos', () => {
    const rows = [
      { cod: '18FLO', seguimiento: 'Diferencia' },
      { cod: '18FLO', seguimiento: 'Registrado' },
    ];
    const { counts, total } = contarTiendasPorEstado(rows, ESTADOS);
    expect(counts['Diferencia']).toBe(1);
    expect(counts['Registrado']).toBe(1);
    expect(total).toBe(1);
  });

  it('estados sin tiendas dan 0 y lista vacía da total 0', () => {
    expect(contarTiendasPorEstado([], ESTADOS).total).toBe(0);
    expect(contarTiendasPorEstado([], ESTADOS).counts['Pendiente']).toBe(0);
  });
});
