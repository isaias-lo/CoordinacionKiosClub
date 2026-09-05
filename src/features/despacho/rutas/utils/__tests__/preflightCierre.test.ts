import { describe, it, expect } from 'vitest';
import { preflightCierre, textoPreflight } from '../preflightCierre';

const t = (c: string, p = 1) => ({ c, p });

describe('preflightCierre', () => {
  it('día limpio: cuenta lo que se va a registrar y no encuentra nada', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A', 'B'],
      asignaciones: { 'AB-1': [t('A'), t('B')] },
      conDatosDeBodega: ['A', 'B'],
    });
    expect(r.camiones).toBe(1);
    expect(r.tiendas).toBe(2);
    expect(r.hallazgos).toEqual([]);
    expect(r.hayHallazgos).toBe(false);
  });

  // El caso 40LIL: carga registrada, sin patente, y nadie se enteró hasta el día siguiente.
  it('encuentra las tiendas con carga que no van en ningún camión', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A', '40LIL'],
      asignaciones: { 'AB-1': [t('A')] },
      conDatosDeBodega: ['A', '40LIL'],
    });
    const h = r.hallazgos.find(x => x.tipo === 'sin-camion');
    expect(h?.items).toEqual(['40LIL']);
    expect(r.hayHallazgos).toBe(true);
  });

  it('encuentra las que van en camión y Bodega nunca registró', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['26ALC', '02SCL'],
      asignaciones: { VXSX43: [t('26ALC'), t('02SCL')] },
      conDatosDeBodega: ['02SCL'],
    });
    expect(r.hallazgos.find(x => x.tipo === 'sin-datos-bodega')?.items).toEqual(['26ALC']);
  });

  // ── Sobre capacidad ──────────────────────────────────────────────────────
  it('encuentra un camión cargado por sobre su capacidad, y dice cuánto', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A', 'B'],
      asignaciones: { 'AB-1': [t('A', 7), t('B', 6)] },
      conDatosDeBodega: ['A', 'B'],
      capacidades: { 'AB-1': 10 },
    });
    const h = r.hallazgos.find(x => x.tipo === 'sobre-capacidad');
    expect(h?.items).toEqual(['AB-1 (13 de 10)']);
  });

  // Ir al tope es normal y se hace todos los días: avisar ahí volvería el preflight ruido.
  it('un camión justo en su capacidad no es un hallazgo', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A', 10)] },
      conDatosDeBodega: ['A'],
      capacidades: { 'AB-1': 10 },
    });
    expect(r.hallazgos).toEqual([]);
  });

  // Si no sabemos la capacidad no podemos afirmar que se pasó. Callar es mejor que inventar.
  it('sin capacidad conocida no inventa el chequeo', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A', 99)] },
      conDatosDeBodega: ['A'],
      capacidades: {},
    });
    expect(r.hallazgos.find(x => x.tipo === 'sobre-capacidad')).toBeUndefined();
  });

  // ── Cerrado sin manifiesto ───────────────────────────────────────────────
  it('encuentra un camión cerrado que no dejó manifiesto guardado', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A', 'B'],
      asignaciones: { 'AB-1': [t('A')], 'CD-2': [t('B')] },
      conDatosDeBodega: ['A', 'B'],
      cerradas: ['AB-1', 'CD-2'],
      manifiestos: [{ patente: 'AB-1' }],
    });
    expect(r.hallazgos.find(x => x.tipo === 'cerrado-sin-manifiesto')?.items).toEqual(['CD-2']);
  });

  it('un camión cerrado con su manifiesto guardado no se reporta', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A')] },
      conDatosDeBodega: ['A'],
      cerradas: ['AB-1'],
      manifiestos: [{ patente: 'AB-1' }],
    });
    expect(r.hallazgos).toEqual([]);
  });

  // Las patentes llegan de fuentes distintas (tablero, `rutas_cerradas`, BD) y no siempre
  // con el mismo formato. Comparar crudo daría un falso positivo en cada cierre.
  it('compara patentes normalizadas: minúsculas y espacios no son un hallazgo', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A')] },
      conDatosDeBodega: ['A'],
      cerradas: [' ab-1 '],
      manifiestos: [{ patente: 'AB-1' }],
    });
    expect(r.hallazgos).toEqual([]);
  });

  it('un manifiesto sin patente no tapa un camión cerrado', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A')] },
      conDatosDeBodega: ['A'],
      cerradas: ['AB-1'],
      manifiestos: [{ patente: null }, { patente: '  ' }],
    });
    expect(r.hallazgos.find(x => x.tipo === 'cerrado-sin-manifiesto')?.items).toEqual(['AB-1']);
  });

  // ── Orden y forma ────────────────────────────────────────────────────────
  // Una tienda que nadie va a llevar es peor que una sin dimensiones: si el panel lista
  // primero lo menos grave, lo grave se lee último o no se lee.
  it('lo más grave va primero', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A', 'HUERFANA'],
      asignaciones: { 'AB-1': [t('A', 20)] },
      conDatosDeBodega: [],
      capacidades: { 'AB-1': 10 },
      cerradas: ['AB-1'],
      manifiestos: [],
    });
    expect(r.hallazgos.map(h => h.tipo)).toEqual([
      'sin-camion', 'cerrado-sin-manifiesto', 'sobre-capacidad', 'sin-datos-bodega',
    ]);
  });

  it('día vacío: nada que registrar y nada que avisar', () => {
    const r = preflightCierre({ fecha: '2026-09-03', enElPool: [], asignaciones: {} });
    expect(r).toMatchObject({ camiones: 0, tiendas: 0, hayHallazgos: false });
  });

  // Una patente sin tiendas existe en el tablero (se creó y se vació) y no es un camión.
  it('una patente sin tiendas no cuenta ni se revisa', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A')], 'CD-2': [] },
      conDatosDeBodega: ['A'],
      capacidades: { 'CD-2': 0 },
    });
    expect(r.camiones).toBe(1);
    expect(r.hallazgos).toEqual([]);
  });
});

describe('textoPreflight', () => {
  it('día limpio: dice qué se va a registrar', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A'],
      asignaciones: { 'AB-1': [t('A')] },
      conDatosDeBodega: ['A'],
    });
    expect(textoPreflight(r)).toBe('1 manifiesto · 1 tienda');
  });

  it('singular y plural', () => {
    const r = preflightCierre({
      fecha: '2026-09-03',
      enElPool: ['A', 'B'],
      asignaciones: { 'AB-1': [t('A')], 'CD-2': [t('B')] },
      conDatosDeBodega: ['A', 'B'],
    });
    expect(textoPreflight(r)).toBe('2 manifiestos · 2 tiendas');
  });
});
