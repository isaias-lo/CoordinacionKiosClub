import { describe, it, expect } from 'vitest';
import { compararPeriodos, periodoAnterior, resumen } from '../tendencia';
import type { RendimientoPicker } from '../rendimiento';

function fila(p: Partial<RendimientoPicker> = {}): RendimientoPicker {
  return {
    name: 'Cristobal Labra', cuentas: ['Pickers 15'],
    ops: 20, opsMedidas: 20, units: 2000, lineCount: 200,
    totalMinutes: 600, avgMinutesPerOp: 30, avgSecondsPerLine: 180, cph: 200, ...p,
  };
}

describe('compararPeriodos: la dirección', () => {
  it('sube cuando el CPH crece más que el umbral', () => {
    const [t] = compararPeriodos([fila({ cph: 240 })], [fila({ cph: 200 })]);
    expect(t.direccion).toBe('sube');
    expect(t.deltaCph).toBe(20);
  });

  it('baja cuando cae más que el umbral', () => {
    const [t] = compararPeriodos([fila({ cph: 150 })], [fila({ cph: 200 })]);
    expect(t.direccion).toBe('baja');
    expect(t.deltaCph).toBe(-25);
  });

  it('una diferencia chica es IGUAL, no una flecha', () => {
    // Sin umbral nadie quedaría nunca igual y el tablero sería todo alarmas que no significan
    // nada: un 2% es qué tiendas le tocaron esa semana, no su ritmo.
    const [t] = compararPeriodos([fila({ cph: 204 })], [fila({ cph: 200 })]);
    expect(t.direccion).toBe('igual');
    expect(t.deltaCph).toBe(2);
  });

  it('el umbral se puede mover', () => {
    const arriba = compararPeriodos([fila({ cph: 204 })], [fila({ cph: 200 })], { umbralPct: 1 });
    expect(arriba[0].direccion).toBe('sube');
  });

  it('justo en el umbral todavía es igual', () => {
    const [t] = compararPeriodos([fila({ cph: 210 })], [fila({ cph: 200 })], { umbralPct: 5 });
    expect(t.deltaCph).toBe(5);
    expect(t.direccion).toBe('sube');   // 5 no es «< 5»
  });
});

describe('compararPeriodos: cuándo NO se puede decir nada', () => {
  it('con muy pocas operaciones medidas no se compara, y se explica', () => {
    // Un −60% calculado sobre 2 operaciones mide la muestra, no a la persona, y alguien lo va a
    // leer como un problema de desempeño.
    const [t] = compararPeriodos([fila({ opsMedidas: 2, cph: 80 })], [fila({ cph: 200 })]);
    expect(t.direccion).toBe('sin-datos');
    expect(t.deltaCph).toBeNull();
    expect(t.motivo).toContain('pocas operaciones');
  });

  it('el mínimo aplica a los DOS períodos', () => {
    const [t] = compararPeriodos([fila({ cph: 200 })], [fila({ opsMedidas: 1, cph: 80 })]);
    expect(t.direccion).toBe('sin-datos');
  });

  it('sin ritmo en el período anterior no hay con qué dividir', () => {
    const [t] = compararPeriodos([fila({ cph: 200 })], [fila({ cph: 0 })]);
    expect(t.direccion).toBe('sin-datos');
    expect(t.deltaCph).toBeNull();
  });

  it('quien no estaba antes sale como nuevo, no como una subida infinita', () => {
    const [t] = compararPeriodos([fila()], []);
    expect(t.direccion).toBe('nuevo');
    expect(t.deltaCph).toBeNull();
    expect(t.previo).toBeNull();
  });

  it('quien dejó de trabajar SIGUE apareciendo', () => {
    // Si solo se listaran los del período actual, desaparecería de la vista sin que nadie lo note.
    const [t] = compararPeriodos([], [fila()]);
    expect(t.nombre).toBe('Cristobal Labra');
    expect(t.actual).toBeNull();
    expect(t.direccion).toBe('sin-datos');
    expect(t.motivo).toContain('no trabajó en este período');
  });
});

describe('compararPeriodos: el orden', () => {
  it('manda el volumen del período actual, no el alfabeto', () => {
    const t = compararPeriodos([
      fila({ name: 'Ana', units: 100 }),
      fila({ name: 'Zoe', units: 5000 }),
      fila({ name: 'Beto', units: 900 }),
    ], []);
    expect(t.map(x => x.nombre)).toEqual(['Zoe', 'Beto', 'Ana']);
  });

  it('los que no trabajaron ahora van al final', () => {
    const t = compararPeriodos(
      [fila({ name: 'Ana', units: 100 })],
      [fila({ name: 'Zoe', units: 9000 })]);
    expect(t.map(x => x.nombre)).toEqual(['Ana', 'Zoe']);
  });
});

describe('resumen', () => {
  it('cuenta cuántos hay en cada dirección', () => {
    const t = compararPeriodos(
      [fila({ name: 'A', cph: 300 }), fila({ name: 'B', cph: 100 }), fila({ name: 'C', cph: 202 })],
      [fila({ name: 'A', cph: 200 }), fila({ name: 'B', cph: 200 }), fila({ name: 'C', cph: 200 })]);
    expect(resumen(t)).toEqual({ sube: 1, baja: 1, igual: 1, nuevo: 0, 'sin-datos': 0 });
  });
});

describe('periodoAnterior', () => {
  it('siete días contra los siete previos', () => {
    expect(periodoAnterior('2026-11-01', '2026-11-07'))
      .toEqual({ desde: '2026-10-25', hasta: '2026-10-31' });
  });

  it('un solo día contra el día anterior', () => {
    expect(periodoAnterior('2026-11-05', '2026-11-05'))
      .toEqual({ desde: '2026-11-04', hasta: '2026-11-04' });
  });

  it('cruza el cambio de mes sin perder un día', () => {
    expect(periodoAnterior('2026-11-01', '2026-11-30'))
      .toEqual({ desde: '2026-10-02', hasta: '2026-10-31' });
  });

  it('los dos períodos tienen el MISMO largo', () => {
    // Comparar contra un período de otro largo compararía también el tamaño de la muestra.
    const dia = 86_400_000;
    const largo = (d: string, h: string) =>
      Math.round((Date.parse(h + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / dia) + 1;
    for (const [d, h] of [['2026-11-01', '2026-11-07'], ['2026-01-01', '2026-01-01'],
                          ['2026-02-25', '2026-03-05']]) {
      const p = periodoAnterior(d, h);
      expect(largo(p.desde, p.hasta)).toBe(largo(d, h));
    }
  });

  it('cruza el año', () => {
    expect(periodoAnterior('2027-01-01', '2027-01-03'))
      .toEqual({ desde: '2026-12-29', hasta: '2026-12-31' });
  });
});
