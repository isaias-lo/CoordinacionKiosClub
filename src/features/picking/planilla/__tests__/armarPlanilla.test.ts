import { describe, it, expect } from 'vitest';
import { armarPlanilla, type MovimientoPlanilla } from '../armarPlanilla';

const TIENDAS = [
  { cod: '38SP2', zona: 'sur'  as const },
  { cod: '56PZA', zona: 'rm'   as const },
  { cod: '75PUC', zona: 'sur'  as const },
];

function mov(p: Partial<MovimientoPlanilla>): MovimientoPlanilla {
  return {
    cod: '38SP2', seccion: 'Comida', registros: 10, picker: 'Marcelo Vergara',
    asignadoEn: '2026-11-03 11:00:00', validadoEn: null, estado: 'done', ...p,
  };
}

describe('armarPlanilla: una fila por tienda, en el orden que se le pasa', () => {
  it('devuelve una fila por tienda del día, aunque no tenga carga', () => {
    const p = armarPlanilla([mov({})], TIENDAS);
    expect(p.filas.map(f => f.cod)).toEqual(['38SP2', '56PZA', '75PUC']);
  });

  it('marca sinCarga la tienda del calendario que hoy no tiene movimientos', () => {
    // 75PUC está en el calendario del martes y no tiene carga: por eso el papel trae 28 y no 29.
    const p = armarPlanilla([mov({})], TIENDAS);
    expect(p.filas.find(f => f.cod === '75PUC')!.sinCarga).toBe(true);
    expect(p.filas.find(f => f.cod === '38SP2')!.sinCarga).toBe(false);
  });

  it('dos movimientos de la MISMA sección quedan en la misma celda', () => {
    // Así es el papel: el coordinador escribe «62 y 46» en la celda de Hogar de 38SP2.
    const p = armarPlanilla([
      mov({ seccion: 'Hogar', registros: 46, asignadoEn: '2026-11-03 14:00:00' }),
      mov({ seccion: 'Hogar', registros: 63, asignadoEn: '2026-11-03 11:00:00' }),
    ], TIENDAS);
    const hogar = p.filas.find(f => f.cod === '38SP2')!.celdas.Hogar;
    expect(hogar.map(c => c.registros)).toEqual([63, 46]);   // en orden de asignación
  });

  it('los sin asignar van al final de la celda, no primeros', () => {
    const p = armarPlanilla([
      mov({ seccion: 'Comida', registros: 9,   asignadoEn: null, picker: '' }),
      mov({ seccion: 'Comida', registros: 163, asignadoEn: '2026-11-03 10:00:00' }),
    ], TIENDAS);
    const comida = p.filas.find(f => f.cod === '38SP2')!.celdas.Comida;
    expect(comida.map(c => c.registros)).toEqual([163, 9]);
  });

  it('un movimiento anulado no entra, y se cuenta como descartado', () => {
    const p = armarPlanilla([
      mov({ estado: 'done' }),
      mov({ estado: 'cancel', registros: 15 }),
    ], TIENDAS);
    expect(p.filas.find(f => f.cod === '38SP2')!.celdas.Comida).toHaveLength(1);
    expect(p.descartados.anulados).toBe(1);
  });

  it('un movimiento sin stock liberado no entra, y se cuenta aparte', () => {
    const p = armarPlanilla([mov({ estado: 'confirmed', registros: 4 })], TIENDAS);
    expect(p.filas.find(f => f.cod === '38SP2')!.celdas.Comida).toHaveLength(0);
    expect(p.descartados.sinLiberar).toBe(1);
    expect(p.descartados.anulados).toBe(0);
  });

  it('un movimiento de una tienda que no está en el día se ignora', () => {
    const p = armarPlanilla([mov({ cod: '99XXX' })], TIENDAS);
    expect(p.filas.every(f => f.sinCarga)).toBe(true);
    expect(p.fueraDelDia).toBe(1);
  });

  it('los totales suman los registros de cada sección', () => {
    const p = armarPlanilla([
      mov({ seccion: 'Comida', registros: 100 }),
      mov({ seccion: 'Comida', registros: 20, cod: '56PZA' }),
      mov({ seccion: 'Hogar',  registros: 7 }),
      mov({ seccion: 'Comida', registros: 999, estado: 'cancel' }),
    ], TIENDAS);
    expect(p.totales.Comida).toBe(120);
    expect(p.totales.Hogar).toBe(7);
    expect(p.totales.Aseo).toBe(0);
    expect(p.totales.Chocolates).toBe(0);
  });

  it('cada fila trae la zona de su tienda', () => {
    const p = armarPlanilla([], TIENDAS);
    expect(p.filas.find(f => f.cod === '56PZA')!.zona).toBe('rm');
  });

  it('un picker vacío queda vacío: no se pone un nombre por defecto', () => {
    const p = armarPlanilla([mov({ picker: '', estado: 'assigned', asignadoEn: null })], TIENDAS);
    expect(p.filas.find(f => f.cod === '38SP2')!.celdas.Comida[0].picker).toBe('');
  });
});
