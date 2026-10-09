import { describe, it, expect } from 'vitest';
import { filasActividad, pasaFiltros, opciones, aCsv, SIN_FILTROS } from '../seguimiento/actividad';
import { contar, textoConteo, resumenHistorial, slotsPorClave, contenidoDe } from '../seguimiento/historial';
import { rangoDe, periodoDe, totales, textoMinutos, textoSegundos, textoRango } from '../seguimiento/estadisticas';
import type { PalletSlot, PrintRecord, PickerStatRow } from '../picking-types';
import type { PickingEvento } from '../picking-utils';

const slot = (id: number, state_key: string, tipo: string, contenido = 'comida', seq: number | null = null): PalletSlot => ({
  id, store_cod: state_key.split('__')[0], state_key, picker_label: 'Juan', tipo, contenido, refs: '', created_at: '', seq,
});
const print = (state_key: string, printed_at: string, extra: Partial<PrintRecord> = {}): PrintRecord => ({
  state_key, printed_at, picker_label: 'Juan', pallets: 1, tipo: 'P', printed_by_name: 'Isaias', ...extra,
});
const ev = (id: number, event_type: 'crear' | 'eliminar', created_at: string, pallet_id: number): PickingEvento => ({
  id, date: '2026-10-09', event_type, pallet_id, state_key: '18FLO__juan', store_cod: '18FLO', tipo: 'P',
  picker_label: 'Juan', actor_name: 'Bodega', created_at,
});

describe('filasActividad', () => {
  const datos = {
    printRecords: [print('18FLO__juan', '2026-10-09T12:00:00Z', { batch: 'BATCH/1', print_count: 2 })],
    nameChanges: [{ id: 1, picker_key: 'p.s', old_name: 'p.s', new_name: 'Pedro', changed_by_name: '', changed_at: '2026-10-09T13:00:00Z' }],
    palletSlots: [slot(5, '18FLO__juan', 'P', 'comida', 2), slot(6, '18FLO__juan', 'B')],
    eventos: [ev(1, 'crear', '2026-10-09T11:00:00Z', 5), ev(2, 'crear', '2026-10-09T11:01:00Z', 9), ev(3, 'eliminar', '2026-10-09T11:02:00Z', 9)],
    supervisors: {},
  };
  const filas = filasActividad(datos);

  it('ordena de la más nueva a la más vieja', () => {
    expect(filas.map(f => f.accion)).toEqual(['renombro', 'imprimio', 'elimino', 'creo', 'creo']);
  });
  it('describe cada acción', () => {
    expect(filas[0]).toMatchObject({ quien: 'Sin atribución', tienda: null, detalle: '«p.s» → «Pedro»' });
    expect(filas[1]).toMatchObject({ detalle: 'Etiquetas de Juan (1 P · 1 B)', batch: 'BATCH/1', veces: 2 });
    expect(filas.find(f => f.id === 'e:1')?.detalle).toBe('Pallet P-2 de Juan · #5');
  });
  it('marca crear y borrar el mismo pallet como posible error', () => {
    expect(filas.filter(f => f.error).map(f => f.id).sort()).toEqual(['e:2', 'e:3']);
    expect(filas.filter(f => pasaFiltros(f, { ...SIN_FILTROS, accion: 'errores' }))).toHaveLength(2);
  });
  it('filtra por acción, tienda y quién', () => {
    expect(filas.filter(f => pasaFiltros(f, { ...SIN_FILTROS, accion: 'creo' }))).toHaveLength(2);
    expect(filas.filter(f => pasaFiltros(f, { ...SIN_FILTROS, tienda: '18FLO' }))).toHaveLength(4);
    expect(filas.filter(f => pasaFiltros(f, { ...SIN_FILTROS, quien: 'Isaias' }))).toHaveLength(1);
  });
  it('deja «Sin atribución» al final de las opciones', () => {
    expect(opciones(filas, 'quien')).toEqual(['Bodega', 'Isaias', 'Sin atribución']);
  });
  it('no repite una impresión en vivo que ya está guardada', () => {
    const conVivo = filasActividad({ ...datos, supervisors: { u: { name: 'Isaias', userId: 'u', lastActive: '', recentPrints: [
      { storeCod: '18FLO', pickerLabel: 'Juan', pallets: 1, tipo: 'P', printedAt: '2026-10-09T12:00:00Z' },
      { storeCod: '23PEÑ', pickerLabel: 'Luis', pallets: 2, tipo: 'P', printedAt: '2026-10-09T12:30:00Z' },
    ] } } });
    expect(conVivo.filter(f => f.enVivo).map(f => f.tienda)).toEqual(['23PEÑ']);
  });
});

describe('aCsv', () => {
  it('separa con punto y coma y escapa comillas', () => {
    expect(aCsv(['a', 'b'], [['x;y', 'di "hola"']])).toBe('a;b\r\n"x;y";"di ""hola"""');
  });
});

describe('historial', () => {
  const slots = [slot(1, 'A__x', 'P'), slot(2, 'A__x', 'B'), slot(3, 'A__y', 'CC', 'congelados'), slot(4, 'A__y', 'CN', 'congelados')];
  it('cuenta las cajas juntas', () => {
    expect(contar(slots)).toEqual({ P: 1, B: 1, cajas: 2 });
    expect(textoConteo({ P: 12, B: 4, cajas: 1 })).toBe('12 P · 4 B · 1 caja');
  });
  it('cuenta una vez las etiquetas de un encargado impreso dos veces', () => {
    const r = resumenHistorial([print('A__x', '1'), print('A__x', '2', { print_count: 2 }), print('A__y', '3')], slotsPorClave(slots));
    expect(r).toMatchObject({ impresiones: 3, reimpresiones: 1, etiquetas: { P: 1, B: 1, cajas: 2 } });
    expect(r.porTienda).toEqual([{ cod: 'A', conteo: { P: 1, B: 1, cajas: 2 }, impresiones: 3 }]);
  });
  it('saca el contenido de los pallets si Odoo no lo tiene', () => {
    expect(contenidoDe('A__y', [], slots.filter(s => s.state_key === 'A__y'))).toEqual(['Congelados']);
    expect(contenidoDe('A__x', [], [slot(1, 'A__x', 'P', 'aseo-comida')])).toEqual(['Aseo', 'Comida']);
  });
});

describe('estadísticas', () => {
  const jueves = new Date(2026, 9, 8, 15, 0);
  it('arma los períodos rápidos', () => {
    expect(rangoDe('hoy', jueves)).toEqual({ desde: '2026-10-08', hasta: '2026-10-08' });
    expect(rangoDe('semana', jueves)).toEqual({ desde: '2026-10-05', hasta: '2026-10-08' });
    expect(rangoDe('mes', jueves)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(periodoDe('2026-10-05', '2026-10-08', jueves)).toBe('semana');
    expect(periodoDe('2026-09-01', '2026-10-08', jueves)).toBe('elegir');
  });
  it('la semana del domingo parte el lunes anterior', () => {
    expect(rangoDe('semana', new Date(2026, 9, 11)).desde).toBe('2026-10-05');
  });
  it('promedia ponderando por operaciones y SKU', () => {
    const r = (ops: number, min: number, lineas: number, seg: number, units: number): PickerStatRow =>
      ({ name: 'x', ops, totalMinutes: 0, avgMinutesPerOp: min, units, lineCount: lineas, avgSecondsPerLine: seg, cph: 0 });
    const t = totales([r(10, 20, 100, 120, 1000), r(30, 10, 300, 60, 3000)]);
    expect(t).toMatchObject({ ops: 40, sku: 400, unidades: 4000, minPorPedido: 12.5, segPorSku: 75, unidadesPorOp: 100 });
  });
  it('formatea tiempos y rangos', () => {
    expect(textoMinutos(19.2)).toBe('19 min');
    expect(textoMinutos(65)).toBe('1 h 5 min');
    expect(textoMinutos(0)).toBe('—');
    expect(textoSegundos(156)).toBe('2,6 min');
    expect(textoSegundos(45)).toBe('45 s');
    expect(textoRango('2026-10-01', '2026-10-31')).toBe('Del 1 al 31 oct');
    expect(textoRango('2026-10-09', '2026-10-09')).toBe('9 oct');
  });
});
