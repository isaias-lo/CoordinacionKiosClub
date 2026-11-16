import { describe, it, expect } from 'vitest';
import { totales, unidadesPorOp } from '../estadisticas';
import type { PickerStatRow } from '../../picking-types';

const fila = (p: Partial<PickerStatRow> = {}): PickerStatRow => ({
  name: 'Cristóbal Labra', ops: 51, units: 65458, lineCount: 4221,
  totalMinutes: 3870, avgMinutesPerOp: 76, avgSecondsPerLine: 55, cph: 1014, ...p,
});

describe('totales: las horas del período', () => {
  it('suma `totalMinutes`, que ya cuenta cada tanda una sola vez', () => {
    const t = totales([fila({ totalMinutes: 600 }), fila({ totalMinutes: 300 })]);
    expect(t.minutos).toBe(900);
  });

  it('NO reconstruye el tiempo como «promedio por pedido × operaciones»', () => {
    // Ese promedio viene redondeado por fila: multiplicarlo de vuelta por 27 personas corre el
    // total. Acá el promedio por pedido es 76 y las ops 51 → 3.876, pero el tiempo real es 3.870.
    const t = totales([fila({ avgMinutesPerOp: 76, ops: 51, totalMinutes: 3870 })]);
    expect(t.minutos).toBe(3870);
    expect(t.minutos).not.toBe(76 * 51);
  });

  it('sin filas no rompe', () => {
    const t = totales([]);
    expect(t.minutos).toBe(0);
    expect(t.cph).toBe(0);
    expect(t.unidadesPorOp).toBe(0);
  });
});

describe('totales: las unidades por hora', () => {
  it('salen del total, no del promedio de los promedios', () => {
    // Promediar los `cph` de cada fila le daría el mismo peso a quien trabajó 1 hora que a quien
    // trabajó 10. El período tiene UN ritmo: sus unidades sobre sus horas.
    const t = totales([
      fila({ units: 1000, totalMinutes: 60,  cph: 1000 }),   // 1 h a 1.000 u/h
      fila({ units: 1000, totalMinutes: 600, cph: 100 }),    // 10 h a 100 u/h
    ]);
    expect(t.cph).toBeCloseTo((2000 / 660) * 60, 4);         // ≈ 182, no 550
    expect(Math.round(t.cph)).toBe(182);
  });

  it('con cero horas medidas da cero y no infinito', () => {
    const t = totales([fila({ units: 500, totalMinutes: 0 })]);
    expect(t.cph).toBe(0);
    expect(Number.isFinite(t.cph)).toBe(true);
  });

  it('el caso real de Cristóbal Labra en noviembre', () => {
    // 65.458 unidades en 64,5 h → 1.014 u/h. Antes del #806 su tiempo era 1,7 veces más y el
    // ritmo salía 425.
    const t = totales([fila({ units: 65458, totalMinutes: 3870 })]);
    expect(Math.round(t.cph)).toBe(1015);   // 64,5 h exactas dan 1.014; 3.870 min dan 1.015
  });
});

describe('unidadesPorOp', () => {
  it('es el tamaño del pedido, no el ritmo', () => {
    expect(Math.round(unidadesPorOp(fila({ units: 65458, ops: 51 })))).toBe(1283);
  });

  it('sin operaciones no divide por cero', () => {
    expect(unidadesPorOp(fila({ ops: 0 }))).toBe(0);
  });
});
