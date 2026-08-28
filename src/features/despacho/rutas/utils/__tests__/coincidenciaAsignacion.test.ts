import { describe, it, expect } from 'vitest';
import { coincidenciaAsignacion, tiendasMovidasEntre, resumenCoincidencia, type FilaFeedback } from '../coincidenciaAsignacion';

describe('coincidenciaAsignacion', () => {
  it('asignaciones idénticas → f1 100%, sin desacuerdos ni movidas', () => {
    const a = { AAA: ['1', '2', '3'], BBB: ['4', '5'] };
    const r = coincidenciaAsignacion(a, a);
    expect(r.f1).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.cobertura).toBe(1);
    expect(r.paresDistintos).toBe(0);
    expect(r.tiendasMovidas).toBe(0);
    expect(r.paresCoinciden).toBe(3 + 1); // C(3,2)=3 juntos en AAA, C(2,2)=1 en BBB
  });

  it('una tienda movida a otro camión → baja f1 y cuenta 1 movida', () => {
    // Propuesta: {1,2,3} juntas. Final: 3 se va a otro camión.
    const prop = { AAA: ['1', '2', '3'] };
    const fin  = { AAA: ['1', '2'], BBB: ['3'] };
    const r = coincidenciaAsignacion(prop, fin);
    expect(r.tiendasMovidas).toBe(1);
    // pares juntos en prop: (1,2),(1,3),(2,3)=3. En final solo (1,2). → tp=1, fp=2, fn=0.
    expect(r.paresCoinciden).toBe(1);
    expect(r.paresDistintos).toBe(2);
    expect(r.precision).toBeCloseTo(1 / 3, 5); // tp/(tp+fp)
    expect(r.cobertura).toBe(1);               // tp/(tp+fn)
    expect(r.f1).toBeCloseTo(2 * (1 / 3) * 1 / ((1 / 3) + 1), 5);
    expect(r.f1).toBeLessThan(1);
  });

  it('propuesta vacía → sin pares, sin movidas (no rompe, no NaN)', () => {
    const r = coincidenciaAsignacion({}, { AAA: ['1', '2'] });
    expect(r.paresCoinciden).toBe(0);
    expect(r.paresDistintos).toBe(0);
    expect(r.tiendasMovidas).toBe(0);
    expect(Number.isNaN(r.f1)).toBe(false);
  });

  it('final vacía → sin pares, sin movidas (no rompe, no NaN)', () => {
    const r = coincidenciaAsignacion({ AAA: ['1', '2'] }, {});
    expect(r.paresCoinciden).toBe(0);
    expect(r.paresDistintos).toBe(0);
    expect(r.tiendasMovidas).toBe(0);
    expect(Number.isNaN(r.f1)).toBe(false);
  });

  it('tienda en un solo lado → se EXCLUYE del conteo de pares (no es desacuerdo)', () => {
    // '9' solo aparece en la final. La intersección {1,2} es idéntica → f1 100%.
    const prop = { AAA: ['1', '2'] };
    const fin  = { AAA: ['1', '2'], BBB: ['9'] };
    const r = coincidenciaAsignacion(prop, fin);
    expect(r.f1).toBe(1);
    expect(r.paresCoinciden).toBe(1); // solo (1,2)
    expect(r.paresDistintos).toBe(0);
    expect(r.tiendasMovidas).toBe(0);
  });

  it('excluir (2ª vuelta / sin flota) saca esas tiendas del cálculo', () => {
    // El motor propuso {1,2,3} juntas y mandó '3' a 2ª vuelta. El coordinador movió '3'.
    // Sin excluir, '3' contaría como desacuerdo; excluyéndola, la intersección {1,2} es perfecta.
    const prop = { AAA: ['1', '2', '3'] };
    const fin  = { AAA: ['1', '2'], BBB: ['3'] };
    const r = coincidenciaAsignacion(prop, fin, ['3']);
    expect(r.f1).toBe(1);
    expect(r.tiendasMovidas).toBe(0);
    expect(r.paresDistintos).toBe(0);
  });

  it('separación total (todas en camiones distintos) coincidente → f1 100%', () => {
    const a = { AAA: ['1'], BBB: ['2'], CCC: ['3'] };
    const r = coincidenciaAsignacion(a, a);
    expect(r.f1).toBe(1);          // vacuosamente perfecto: nada que contradecir
    expect(r.paresCoinciden).toBe(0);
    expect(r.paresDistintos).toBe(0);
  });
});

describe('tiendasMovidasEntre', () => {
  it('lista los cods que cambiaron de camión (intersección)', () => {
    const prop = { AAA: ['1', '2', '3'], BBB: ['4'] };
    const fin  = { AAA: ['1', '2'], BBB: ['4'], CCC: ['3'] };
    expect(tiendasMovidasEntre(prop, fin).sort()).toEqual(['3']);
  });

  it('ignora las de un solo lado y las excluidas', () => {
    const prop = { AAA: ['1', '2'], BBB: ['7'] };       // '7' no está en final
    const fin  = { AAA: ['1'], CCC: ['2'], DDD: ['9'] }; // '9' no está en prop
    // '2' se movió; '1' quedó; '7'/'9' de un solo lado se ignoran.
    expect(tiendasMovidasEntre(prop, fin)).toEqual(['2']);
    expect(tiendasMovidasEntre(prop, fin, ['2'])).toEqual([]); // excluida
  });
});

describe('resumenCoincidencia', () => {
  const HOY = '2026-08-27';

  it('promedia f1 solo de días con propuesta y pares, y arma el top de movidas', () => {
    const rows: FilaFeedback[] = [
      // Hoy: {1,2,3} propuestas juntas; el coordinador movió '3' → f1 < 1, '3' movida.
      { fecha: HOY, propuesta_ia: { A: ['1', '2', '3'] }, final: { A: ['1', '2'], B: ['3'] } },
      // Ayer: idénticas → f1 1.
      { fecha: '2026-08-26', propuesta_ia: { A: ['1', '2'] }, final: { A: ['1', '2'] } },
      // Día sin propuesta (motor no corrió) → se ignora, no baja el promedio.
      { fecha: '2026-08-25', propuesta_ia: null, final: { A: ['1'] } },
    ];
    const r = resumenCoincidencia(rows, HOY);
    expect(r.dias).toBe(2);                        // solo los dos con propuesta y pares
    expect(r.hoy).not.toBeNull();
    expect(r.hoy!.tiendasMovidas).toBe(1);
    expect(r.tiendasTop).toEqual([{ cod: '3', veces: 1 }]);
    // promedio = (f1_hoy + 1) / 2, con f1_hoy < 1 → entre 0.5 y 1.
    expect(r.promedioF1).toBeGreaterThan(0.5);
    expect(r.promedioF1).toBeLessThan(1);
  });

  it('sin fila de hoy → hoy es null pero el promedio histórico sigue', () => {
    const rows: FilaFeedback[] = [
      { fecha: '2026-08-20', propuesta_ia: { A: ['1', '2', '3'] }, final: { A: ['1', '2'], B: ['3'] } },
    ];
    const r = resumenCoincidencia(rows, HOY);
    expect(r.hoy).toBeNull();
    expect(r.dias).toBe(1);
    expect(r.promedioF1).not.toBeNull();
    expect(r.tiendasTop).toEqual([{ cod: '3', veces: 1 }]);
  });

  it('excluye 2ª vuelta/sin flota al medir y al contar movidas', () => {
    const rows: FilaFeedback[] = [
      { fecha: HOY, propuesta_ia: { A: ['1', '2', '3'] }, final: { A: ['1', '2'], B: ['3'] },
        segunda_vuelta: ['3'] },
    ];
    const r = resumenCoincidencia(rows, HOY);
    expect(r.hoy!.f1).toBe(1);            // '3' excluida → intersección {1,2} perfecta
    expect(r.tiendasTop).toEqual([]);     // '3' no cuenta como movida
    expect(r.dias).toBe(1);
  });

  it('sin filas → todo vacío/null', () => {
    const r = resumenCoincidencia([], HOY);
    expect(r.hoy).toBeNull();
    expect(r.promedioF1).toBeNull();
    expect(r.dias).toBe(0);
    expect(r.tiendasTop).toEqual([]);
  });
});
