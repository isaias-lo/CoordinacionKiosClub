import { describe, it, expect } from 'vitest';
import { medirBorrados, tipoDeEtiqueta, type BorradoBodega } from '../borradosRepetidos';

const b = (fecha: string, slotId: number | null, label: string | null = 'CH1'): BorradoBodega =>
  ({ fecha, slotId, label });

describe('tipoDeEtiqueta — las dos escrituras de los espejos', () => {
  it('Nacional escribe el bulto B3; RM/Costa lo escribe 3B', () => {
    // Misma diferencia que documenta numeroCard.ts. Leer solo una forma dejaba fuera los bultos
    // de un espejo entero.
    expect(tipoDeEtiqueta('B3')).toBe('B');
    expect(tipoDeEtiqueta('3B')).toBe('B');
  });

  it('CH se evalúa antes que C, o CH3 caería en contenedor', () => {
    expect(tipoDeEtiqueta('CH3')).toBe('CH');
    expect(tipoDeEtiqueta('CH11')).toBe('CH');
    expect(tipoDeEtiqueta('C3')).toBe('C');
  });

  it('pallets y mayúsculas/espacios', () => {
    expect(tipoDeEtiqueta('P5')).toBe('P');
    expect(tipoDeEtiqueta(' ch2 ')).toBe('CH');
  });

  it('lo que no reconoce devuelve null, no un tipo inventado', () => {
    for (const v of [null, undefined, '', '12345', 'XYZ1']) expect(tipoDeEtiqueta(v)).toBeNull();
  });
});

describe('medirBorrados — cuántas unidades hubo que borrar dos veces', () => {
  it('un borrado por unidad = nada volvió', () => {
    const [dia] = medirBorrados([b('2026-09-25', 1), b('2026-09-25', 2), b('2026-09-25', 3)]);
    expect(dia).toMatchObject({ unidades: 3, volvieron: 0, pct: 0, borradosDeMas: 0 });
  });

  it('el caso de 33CON: nueve borrados, los nueve repetidos', () => {
    const slots = [2, 3, 4, 5, 6, 7, 8, 9, 11];
    const filas = [...slots, ...slots].map(s => b('2026-09-16', s, `CH${s}`));
    const [dia] = medirBorrados(filas);
    expect(dia).toMatchObject({ unidades: 9, volvieron: 9, pct: 100, borradosDeMas: 9 });
  });

  it('tres borrados de la misma unidad cuentan DOS de más', () => {
    const [dia] = medirBorrados([b('2026-09-17', 13912), b('2026-09-17', 13912), b('2026-09-17', 13912)]);
    expect(dia).toMatchObject({ unidades: 1, volvieron: 1, borradosDeMas: 2 });
  });

  it('el porcentaje sale con un decimal', () => {
    // 1 de 3 = 33,3%
    const [dia] = medirBorrados([b('2026-09-25', 1), b('2026-09-25', 1), b('2026-09-25', 2), b('2026-09-25', 3)]);
    expect(dia.pct).toBe(33.3);
  });

  it('separa por tipo, que es donde se ve que no es solo del chocolate', () => {
    const [dia] = medirBorrados([
      b('2026-09-15', 1, 'CH1'), b('2026-09-15', 1, 'CH1'),   // chocolate que volvió
      b('2026-09-15', 2, 'CH2'),                               // chocolate que no
      b('2026-09-15', 3, 'P5'),  b('2026-09-15', 3, 'P5'),    // pallet que volvió (04PDG, 15/09)
      b('2026-09-15', 4, '3B'),                                // bulto de RM/Costa
    ]);
    expect(dia.porTipo.CH).toEqual({ unidades: 2, volvieron: 1 });
    expect(dia.porTipo.P).toEqual({ unidades: 1, volvieron: 1 });
    expect(dia.porTipo.B).toEqual({ unidades: 1, volvieron: 0 });
    expect(dia.porTipo.C).toEqual({ unidades: 0, volvieron: 0 });
  });

  it('un borrado SIN slot se descarta: no hay con qué emparejarlo', () => {
    // Contarlo como "no volvió" bajaría el porcentaje — la dirección en la que un error pasa
    // inadvertido ("bajaron los borrados repetidos").
    const [dia] = medirBorrados([b('2026-09-25', null), b('2026-09-25', 1)]);
    expect(dia.unidades).toBe(1);
  });

  it('cada día se cuenta por separado y salen del más nuevo al más viejo', () => {
    const dias = medirBorrados([
      b('2026-09-23', 1), b('2026-09-25', 2), b('2026-09-24', 3), b('2026-09-24', 3),
    ]);
    expect(dias.map(d => d.fecha)).toEqual(['2026-09-25', '2026-09-24', '2026-09-23']);
    expect(dias[1]).toMatchObject({ volvieron: 1 });
  });

  it('el mismo slot en días distintos NO es una repetición', () => {
    const dias = medirBorrados([b('2026-09-24', 7), b('2026-09-25', 7)]);
    expect(dias.every(d => d.volvieron === 0)).toBe(true);
  });

  it('sin datos devuelve una lista vacía, no un día en cero', () => {
    expect(medirBorrados([])).toEqual([]);
  });

  it('conserva la etiqueta aunque falte en una de las repeticiones', () => {
    const [dia] = medirBorrados([b('2026-09-25', 1, null), b('2026-09-25', 1, 'CH4')]);
    expect(dia.porTipo.CH).toEqual({ unidades: 1, volvieron: 1 });
  });
});
