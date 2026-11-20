import { describe, it, expect } from 'vitest';
import { rankingDeEspecialidad, rankingPorEspecialidad, minOpsDelPeriodo, type FilaRankeable }
  from '../rankingEspecialidad';

/** Una fila mínima. `opsMedidas` sólo importa cuando se usa `minOpsMedidas`. */
const fila = (cph: number, totalMinutes = 60, opsMedidas = 10): FilaRankeable & { id: string } =>
  ({ id: `cph${cph}`, cph, totalMinutes, opsMedidas });

describe('rankingDeEspecialidad', () => {
  it('ordena de mayor a menor ritmo y numera desde 1', () => {
    const r = rankingDeEspecialidad('seco', [fila(100), fila(300), fila(200)]);
    expect(r.puestos.map(p => p.puesto)).toEqual([1, 2, 3]);
    expect(r.puestos.map(p => p.fila.cph)).toEqual([300, 200, 100]);
  });

  it('el índice es el ritmo dividido por el promedio de la especialidad', () => {
    // promedio = (300 + 200 + 100) / 3 = 200
    const r = rankingDeEspecialidad('seco', [fila(100), fila(300), fila(200)]);
    expect(r.promedio).toBe(200);
    expect(r.comparables).toBe(3);
    expect(r.puestos.map(p => p.indice)).toEqual([1.5, 1, 0.5]);
  });

  it('el caso real: Flores cubriendo congelados queda casi en el promedio', () => {
    // Medido 01→16/11/2026 (ver especialidad.ts): especialistas 56 u/h, Flores cubriendo 52.
    const r = rankingDeEspecialidad('congelados', [fila(56), fila(52)]);
    expect(r.promedio).toBe(54);
    expect(r.puestos[0]).toMatchObject({ puesto: 1, indice: 1.04 });
    expect(r.puestos[1]).toMatchObject({ puesto: 2, indice: 0.96 });
  });

  it('el mismo ritmo comparte puesto y el siguiente salta', () => {
    const r = rankingDeEspecialidad('seco', [fila(200), fila(200), fila(100)]);
    expect(r.puestos.map(p => p.puesto)).toEqual([1, 1, 3]);
  });

  it('una fila sin horas medidas no se rankea ni promedia, pero no desaparece', () => {
    // Es el defecto ② de la hoja del bono: sus ceros le bajan el objetivo a todos.
    const sinHoras = fila(0, 0);
    const r = rankingDeEspecialidad('seco', [fila(300), sinHoras, fila(100)]);
    expect(r.promedio).toBe(200);
    expect(r.comparables).toBe(2);
    expect(r.puestos).toHaveLength(2);
    expect(r.sinMedir).toEqual([sinHoras]);
  });

  it('un ritmo de cero con horas tampoco promedia', () => {
    const r = rankingDeEspecialidad('seco', [fila(300), fila(0, 90), fila(100)]);
    expect(r.promedio).toBe(200);
    expect(r.sinMedir).toHaveLength(1);
  });

  it('sin filas medibles el promedio es 0 y el índice es null', () => {
    const r = rankingDeEspecialidad('chocolates', [fila(0, 0), fila(0, 0)]);
    expect(r.promedio).toBe(0);
    expect(r.comparables).toBe(0);
    expect(r.puestos).toEqual([]);
    expect(r.sinMedir).toHaveLength(2);
  });

  it('sin filas devuelve la especialidad vacía, no explota', () => {
    const r = rankingDeEspecialidad('congelados', []);
    expect(r).toEqual({
      especialidad: 'congelados', promedio: 0, comparables: 0, puestos: [], sinMedir: [],
      minOps: 0,
    });
  });

  it('minOpsMedidas saca la muestra chica del PROMEDIO pero la deja en el ranking', () => {
    // El caso que motivó el parámetro: 0,7 h de trabajo daban 16.000 u/h y arrastraban el promedio.
    const chica = fila(16000, 42, 2);
    const r = rankingDeEspecialidad('seco', [chica, fila(300), fila(100)], 5);
    expect(r.promedio).toBe(200);          // 16.000 no entra
    expect(r.comparables).toBe(2);
    expect(r.puestos).toHaveLength(3);     // pero sí se ve, en el puesto 1
    expect(r.puestos[0].fila).toBe(chica);
    expect(r.puestos[0].indice).toBe(80);  // 16.000 / 200 — queda a la vista que es raro
  });

  it('con minOpsMedidas en 0 (el defecto) entran todas', () => {
    const r = rankingDeEspecialidad('seco', [fila(16000, 42, 2), fila(300), fila(100)]);
    expect(r.comparables).toBe(3);
  });

  it('una fila sin opsMedidas cuenta como 0 y no promedia si hay mínimo', () => {
    const r = rankingDeEspecialidad('seco', [{ cph: 300, totalMinutes: 60 }, fila(100)], 5);
    expect(r.comparables).toBe(1);
    expect(r.promedio).toBe(100);
  });

  it('devuelve la fila original, no una copia', () => {
    const f = fila(300);
    const r = rankingDeEspecialidad('seco', [f]);
    expect(r.puestos[0].fila).toBe(f);
  });

  it('no modifica el arreglo que recibe', () => {
    const filas = [fila(100), fila(300)];
    const copia = [...filas];
    rankingDeEspecialidad('seco', filas);
    expect(filas).toEqual(copia);
  });
});

describe('rankingPorEspecialidad', () => {
  it('devuelve las tres, siempre en el mismo orden', () => {
    const r = rankingPorEspecialidad({
      seco: [fila(726)], chocolates: [], congelados: [fila(56), fila(52)],
    });
    expect(r.map(x => x.especialidad)).toEqual(['seco', 'chocolates', 'congelados']);
    expect(r[1].puestos).toEqual([]);
    expect(r[2].promedio).toBe(54);
  });

  it('cada especialidad se promedia contra sí misma, no contra las otras', () => {
    // Lo que hace mal la hoja: un solo $F$1 para todos.
    const r = rankingPorEspecialidad({
      seco: [fila(726)], chocolates: [fila(800)], congelados: [fila(56), fila(52)],
    });
    expect(r[0].promedio).toBe(726);
    expect(r[0].puestos[0].indice).toBe(1);
    expect(r[2].puestos[0].indice).toBe(1.04);   // 56 / 54, no 56 / 726
  });
});

describe('minOpsDelPeriodo', () => {
  // Los casos están medidos sobre noviembre de 2026 — ver la cabecera de la función.
  it.each([
    ['mié 18 · un día · seco',        7,   3],
    ['vie 06 · un día · seco',        6,   2],
    ['vie 06 · un día · chocolates', 10,   4],
    ['16–19 · semana · seco',        22,   8],
    ['1–19 · el mes · seco',         72,  10],
    ['1–19 · el mes · chocolates',  167,  10],
    ['1–19 · el mes · congelados',  297,  10],
  ])('%s: máximo %i → mínimo %i', (_caso, max, esperado) => {
    expect(minOpsDelPeriodo([fila(500, 60, max)])).toBe(esperado);
  });

  it('el piso es 2: una operación suelta no es un ritmo', () => {
    expect(minOpsDelPeriodo([fila(500, 60, 1)])).toBe(2);
    expect(minOpsDelPeriodo([fila(500, 60, 2)])).toBe(2);
    expect(minOpsDelPeriodo([fila(500, 60, 3)])).toBe(2);   // ceil(3/3) = 1 → sube al piso
  });

  it('el techo es 10: nunca exige más que el valor validado para el mes', () => {
    expect(minOpsDelPeriodo([fila(500, 60, 30)])).toBe(10);
    expect(minOpsDelPeriodo([fila(500, 60, 9999)])).toBe(10);
  });

  it('sin filas devuelve el piso, no cero ni NaN', () => {
    expect(minOpsDelPeriodo([])).toBe(2);
  });

  it('una fila sin horas no sube la vara: no va a promediar igual', () => {
    // 60 operaciones pero 0 minutos → pediría 10 y dejaría a los demás fuera por nada.
    expect(minOpsDelPeriodo([fila(0, 0, 60), fila(500, 60, 6)])).toBe(2);
  });

  it('una fila con ritmo cero tampoco sube la vara', () => {
    expect(minOpsDelPeriodo([fila(0, 90, 60), fila(500, 60, 6)])).toBe(2);
  });

  it('una fila sin opsMedidas cuenta como 0', () => {
    expect(minOpsDelPeriodo([{ cph: 500, totalMinutes: 60 }])).toBe(2);
  });

  it('EL CASO DEL COORDINADOR: el mínimo baja cuando entra más gente al área', () => {
    // Las 71 operaciones de seco del mié 18/11 repartidas entre más gente. Medido: con el 10 fijo
    // los tres casos dejan el promedio en cero.
    const reparto = (personas: number) => {
      const base = Math.floor(71 / personas), resto = 71 % personas;
      return Array.from({ length: personas }, (_, i) => fila(500, 60, base + (i < resto ? 1 : 0)));
    };
    for (const personas of [23, 30, 40]) {
      const filas = reparto(personas);
      const min = minOpsDelPeriodo(filas);
      expect(min).toBe(2);
      // Con el mínimo relativo hay promedio; con el 10 fijo no habría ninguno.
      expect(rankingDeEspecialidad('seco', filas, min).comparables).toBeGreaterThan(0);
      expect(rankingDeEspecialidad('seco', filas, 10).comparables).toBe(0);
    }
  });
});

describe("rankingPorEspecialidad con minOpsMedidas 'auto'", () => {
  it('cada especialidad resuelve SU mínimo, no el de la más cargada', () => {
    // El mes real: el más cargado de seco hizo 72 operaciones y el de congelados 297. Un mínimo
    // común saldría de 297 y dejaría a seco sin nadie en el promedio.
    const r = rankingPorEspecialidad({
      seco:       [fila(500, 60, 6), fila(300, 60, 3)],
      chocolates: [],
      congelados: [fila(56, 60, 297), fila(52, 60, 38)],
    }, 'auto');
    expect(r[0].minOps).toBe(2);
    expect(r[0].comparables).toBe(2);
    expect(r[0].promedio).toBe(400);
    expect(r[2].minOps).toBe(10);
    expect(r[2].promedio).toBe(54);
  });

  it('un día de seco tiene promedio con auto y no lo tiene con el 10 fijo', () => {
    // 23 personas con entre 1 y 7 operaciones: la forma real del mié 18/11.
    const filas = Array.from({ length: 23 }, (_, i) => fila(600 + i, 60, (i % 7) + 1));
    const vacias = { chocolates: [], congelados: [] } as const;
    const auto  = rankingPorEspecialidad({ seco: filas, ...vacias }, 'auto')[0];
    const fijo  = rankingPorEspecialidad({ seco: filas, ...vacias }, 10)[0];
    expect(auto.minOps).toBe(3);
    expect(auto.comparables).toBeGreaterThan(0);
    expect(auto.puestos[0].indice).not.toBeNull();
    expect(fijo.comparables).toBe(0);
    expect(fijo.puestos[0].indice).toBeNull();   // sin promedio no hay índice
  });

  it('el ranking muestra a todos aunque no promedien, en los dos modos', () => {
    const filas = Array.from({ length: 23 }, (_, i) => fila(600 + i, 60, (i % 7) + 1));
    const vacias = { chocolates: [], congelados: [] } as const;
    expect(rankingPorEspecialidad({ seco: filas, ...vacias }, 'auto')[0].puestos).toHaveLength(23);
    expect(rankingPorEspecialidad({ seco: filas, ...vacias }, 10)[0].puestos).toHaveLength(23);
  });

  it('sin auto, el 0 por defecto sigue haciendo lo de antes', () => {
    const r = rankingPorEspecialidad({ seco: [fila(500, 60, 1)], chocolates: [], congelados: [] });
    expect(r[0].minOps).toBe(0);
    expect(r[0].comparables).toBe(1);
  });
});
